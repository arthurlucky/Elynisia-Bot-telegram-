import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getUserDB } from "./db.js";
import { eventBus } from "./eventBus.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_ROOT = path.join(__dirname, "..", "memory");

class SchedulerAndQueueManager {
  constructor() {
    this.cronJobs = new Map(); // jobId -> cronTask
    this.activeQueues = new Map(); // userId -> boolean (is processing)
  }

  /**
   * Start the scheduler by loading all saved jobs from all users
   */
  async start(botInstance) {
    this.bot = botInstance;
    console.log("[Scheduler] Starting scheduler...");

    try {
      if (!fs.existsSync(MEMORY_ROOT)) return;

      const userDirs = fs.readdirSync(MEMORY_ROOT);
      for (const userId of userDirs) {
        const userDir = path.join(MEMORY_ROOT, userId);
        if (fs.statSync(userDir).isDirectory()) {
          const files = fs.readdirSync(userDir);
          const dbFile = files.find(f => f.endsWith(".db"));
          if (dbFile) {
            await this.loadUserCronJobs(userId);
          }
        }
      }
    } catch (err) {
      console.error("[Scheduler] Error loading cron jobs during startup:", err.message);
    }
  }

  /**
   * Load cron jobs for a specific user and register them with node-cron
   */
  async loadUserCronJobs(userId) {
    try {
      const db = await getUserDB(userId);
      const jobs = await db.all("SELECT * FROM scheduler_jobs WHERE status = 'active'");
      
      for (const job of jobs) {
        this.scheduleJob(userId, job);
      }
    } catch (err) {
      console.error(`[Scheduler] Error loading jobs for user ${userId}:`, err.message);
    }
  }

  /**
   * Schedule a job using node-cron
   */
  scheduleJob(userId, job) {
    const cronKey = `${userId}_${job.id}`;
    
    // Stop existing job if already running
    if (this.cronJobs.has(cronKey)) {
      this.cronJobs.get(cronKey).stop();
      this.cronJobs.delete(cronKey);
    }

    if (!cron.validate(job.schedule)) {
      console.warn(`[Scheduler] Invalid cron expression: "${job.schedule}" for job "${job.name}"`);
      return;
    }

    const task = cron.schedule(job.schedule, async () => {
      console.log(`[Scheduler] Executing scheduled job: "${job.name}" for user ${userId}`);
      try {
        const db = await getUserDB(userId);
        await db.run("UPDATE scheduler_jobs SET last_run = ? WHERE id = ?", [Date.now(), job.id]);

        // Push job to user's task queue to be executed by agent loop
        await this.addJobToQueue(userId, `[SCHEDULER: ${job.name}] ${job.prompt}`);
      } catch (err) {
        console.error(`[Scheduler] Error running job "${job.name}":`, err.message);
      }
    });

    this.cronJobs.set(cronKey, task);
  }

  /**
   * Add a job to user's database scheduler_jobs table and schedule it
   */
  async createCronJob(userId, name, schedule, prompt) {
    const db = await getUserDB(userId);
    const res = await db.run(
      "INSERT INTO scheduler_jobs (name, type, schedule, prompt, status) VALUES (?, ?, ?, ?, ?)",
      [name, "cron", schedule, prompt, "active"]
    );
    
    const jobId = res.lastID;
    const job = { id: jobId, name, schedule, prompt, status: "active" };
    this.scheduleJob(userId, job);
    return job;
  }

  /**
   * Delete a cron job
   */
  async deleteCronJob(userId, jobId) {
    const db = await getUserDB(userId);
    await db.run("DELETE FROM scheduler_jobs WHERE id = ?", [jobId]);
    
    const cronKey = `${userId}_${jobId}`;
    if (this.cronJobs.has(cronKey)) {
      this.cronJobs.get(cronKey).stop();
      this.cronJobs.delete(cronKey);
      return true;
    }
    return false;
  }

  /**
   * Add a prompt to the task queue
   */
  async addJobToQueue(userId, prompt) {
    const db = await getUserDB(userId);
    const res = await db.run(
      "INSERT INTO task_queue (prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [prompt, "Pending", Date.now(), Date.now()]
    );
    
    // Start processing queue for this user (runs in background)
    this.processUserQueue(userId);
    return res.lastID;
  }

  /**
   * Process task queue for a specific user sequentially
   */
  async processUserQueue(userId) {
    if (this.activeQueues.get(userId)) {
      // Already running a job for this user
      return;
    }

    this.activeQueues.set(userId, true);

    try {
      const db = await getUserDB(userId);
      
      while (true) {
        // Fetch first pending job
        const pendingJobs = await db.all(
          "SELECT * FROM task_queue WHERE status = 'Pending' ORDER BY id ASC LIMIT 1"
        );

        if (pendingJobs.length === 0) {
          break;
        }

        const job = pendingJobs[0];
        await db.run("UPDATE task_queue SET status = ?, updated_at = ? WHERE id = ?", ["Running", Date.now(), job.id]);

        try {
          console.log(`[Queue] Running job ${job.id} for user ${userId}`);
          
          // Emit event to agent loop to execute the prompt
          // The event receiver will call the LLM and run tools, and return a result
          const result = await this.executeJobWithAgent(userId, job);
          
          await db.run(
            "UPDATE task_queue SET status = ?, result = ?, updated_at = ? WHERE id = ?",
            ["Completed", result, Date.now(), job.id]
          );
        } catch (err) {
          console.error(`[Queue] Job ${job.id} failed:`, err.message);
          await db.run(
            "UPDATE task_queue SET status = ?, result = ?, updated_at = ? WHERE id = ?",
            ["Failed", err.message, Date.now(), job.id]
          );
        }
      }
    } catch (err) {
      console.error(`[Queue] Error processing queue for user ${userId}:`, err.message);
    } finally {
      this.activeQueues.delete(userId);
    }
  }

  /**
   * Request the agent loop to execute this job
   */
  async executeJobWithAgent(userId, job) {
    return new Promise((resolve, reject) => {
      // Emit execution request. The main bot gateway will listen to this event.
      // Once execution is complete, the gateway will resolve it.
      eventBus.emitEvent("execute_queue_job", {
        userId,
        jobId: job.id,
        prompt: job.prompt,
        onComplete: (result) => resolve(result),
        onError: (err) => reject(err)
      });
    });
  }

  /**
   * Get user's active jobs
   */
  async getUserJobs(userId) {
    const db = await getUserDB(userId);
    return db.all("SELECT * FROM task_queue ORDER BY id DESC LIMIT 20");
  }
}

export const scheduler = new SchedulerAndQueueManager();
export default scheduler;
