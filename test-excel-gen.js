const xlsx = require('xlsx');
const fs = require('fs');

const headers = [
  'Nama', 'NIS', 'NISN', 'NIK', 'Jenis Kelamin',
  'Tempat Lahir', 'Tanggal Lahir', 'Alamat',
  'Nama Ayah', 'Pekerjaan Ayah', 'Nama Ibu', 'Pekerjaan Ibu',
  'No HP Wali', 'Pendidikan Terakhir', 'Berat', 'Tinggi',
  'Tahun Masuk', 'Provinsi', 'Kota', 'Kecamatan', 'Desa'
];

const sample = [
  'Ahmad Santri', '20260001', '0012345678', '1234567890123456', 'L',
  'Malang', '2010-05-15', 'Jl. Pesantren No. 123',
  'Bpk. Fulan', 'Wiraswasta', 'Ibu Fulanah', 'IRT',
  '081234567890', 'SD/MI', '45', '160',
  '2026', 'Jawa Timur', 'Malang', 'Ngadiluwih', 'Purwokerto'
];

const ws = xlsx.utils.aoa_to_sheet([headers, sample]);

// Make column headers bold, and data text
const range = xlsx.utils.decode_range(ws['!ref']);
for (let C = range.s.c; C <= range.e.c; ++C) {
  const header = headers[C];
  if (['NIS', 'NISN', 'NIK', 'No HP Wali'].includes(header)) {
    // Set column width
    if (!ws['!cols']) ws['!cols'] = [];
    ws['!cols'][C] = { wch: 20 };
    
    // Set cell format to text ('@') for the sample row
    // and theoretically for the whole column if possible
    const cellRef = xlsx.utils.encode_cell({ r: 1, c: C });
    if (ws[cellRef]) {
      ws[cellRef].z = '@';
    }
  }
}

const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "Template Santri");
fs.writeFileSync('template.xlsx', xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
console.log('Template generated');
