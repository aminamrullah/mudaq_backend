const xlsx = require('xlsx');
const fs = require('fs');

const headers = [
  'Nama', 'NIS', 'NISN', 'NIK', 'Jenis Kelamin',
  'Tempat Lahir', 'Tanggal Lahir', 'Alamat',
  'Nama Ayah', 'Pekerjaan Ayah', 'Nama Ibu', 'Pekerjaan Ibu',
  'No HP Wali', 'Pendidikan Terakhir', 'Berat', 'Tinggi',
  'Tahun Masuk', 'Provinsi', 'Kota', 'Kecamatan', 'Desa'
]
const sample = [
  'Ahmad Santri', '20260001', '0012345678', '1234567890123456', 'L',
  'Malang', '2010-05-15', 'Jl. Pesantren No. 123',
  'Bpk. Fulan', 'Wiraswasta', 'Ibu Fulanah', 'IRT',
  '081234567890', 'SD/MI', '45', '160',
  '2026', 'Jawa Timur', 'Malang', 'Ngadiluwih', 'Purwokerto'
]

const csvContent = "\uFEFF" + [headers.join(','), sample.join(',')].join('\n')
fs.writeFileSync('template.csv', csvContent);

const fileBuffer = fs.readFileSync('template.csv');
const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet);

console.log('Total rows:', data.length);

const getValue = (row, keys) => {
  const rowKeys = Object.keys(row);
  for (const key of keys) {
    const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
    if (foundKey) return row[foundKey];
  }
  return undefined;
};

for (const row of data) {
  const name = getValue(row, ['Nama', 'Nama Lengkap', 'name', 'Full Name']);
  const nik = getValue(row, ['NIK', 'nik', 'No. KTP']);
  const birth_date = getValue(row, ['Tanggal Lahir', 'birth_date', 'DoB']);
  const mother_name = getValue(row, ['Nama Ibu', 'mother_name', 'Mother']);
  
  console.log({ name, nik, birth_date, mother_name });
}
