# SKILL: UI/UX React.js Implementation

## Metadata
- **Name**: UI/UX React.js Implementation
- **Description**: Panduan komprehensif untuk mengimplementasikan desain UI/UX ke dalam komponen React.js dengan fokus pada aksesibilitas, performa, dan skalabilitas.
- **Author**: Emora
- **Version**: 1.0.0

## Alur Kerja (Workflow)
1. **Analisis Desain (UX Analysis)**:
   - Bedah Figma/Adobe XD/Sketch.
   - Identifikasi User Flow dan State (Loading, Error, Empty, Success).
   - Tentukan Design System (Warna, Tipografi, Spacing).

2. **Arsitektur Komponen (UI Architecture)**:
   - Pecah desain menjadi komponen atomik (Atomic Design: Atoms $\rightarrow$ Molecules $\rightarrow$ Organisms).
   - Tentukan props yang dibutuhkan untuk fleksibilitas.
   - Pilih library styling (Tailwind CSS, Styled Components, atau CSS Modules).

3. **Implementasi Kode (Development)**:
   - Bangun komponen dasar (Button, Input, Typography).
   - Implementasikan layout responsif (Mobile First).
   - Integrasikan state management untuk interaksi UI.

4. **Optimasi & Validasi (Refinement)**:
   - Cek aksesibilitas (ARIA labels, Contrast ratio).
   - Optimasi render (React.memo, useMemo, useCallback).
   - Testing lintas browser dan device.

## Best Practices
- **Keterbacaan**: Gunakan penamaan class/komponen yang deskriptif (BEM atau Utility-first).
- **Reusability**: Jangan hardcode nilai, gunakan theme provider atau variabel CSS.
- **Performance**: Lazy load komponen berat dan optimasi aset gambar.
- **UX Detail**: Tambahkan skeleton screen saat loading dan feedback instan saat user berinteraksi.

## Checklist Akhir
- [ ] Apakah desain sudah responsif di semua ukuran layar?
- [ ] Apakah kontras warna sudah memenuhi standar WCAG?
- [ ] Apakah komponen dapat digunakan kembali (reusable)?
- [ ] Apakah transisi/animasi terasa smooth dan tidak mengganggu?
- [ ] Apakah struktur folder rapi dan mudah dimaintain?
