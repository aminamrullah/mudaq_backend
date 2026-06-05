const xlsx = require('xlsx');

function testImport() {
  const headers = [
    'Nama', 'NIS', 'NISN', 'NIK', 'Jenis Kelamin',
    'Tempat Lahir', 'Tanggal Lahir', 'Alamat',
    'Nama Ayah', 'Pekerjaan Ayah', 'Nama Ibu', 'Pekerjaan Ibu',
    'No HP Wali', 'Email Wali', 'Pendidikan Terakhir', 'Berat', 'Tinggi',
    'Tahun Masuk', 'Provinsi', 'Kota', 'Kecamatan', 'Desa'
  ];

  const sample = [
    'Ahmad Santri', '20260001', "'0012345678", "'1234567890123456", 'L',
    'Malang', '2010-05-15', 'Jl. Pesantren No. 123',
    'Bpk. Fulan', 'Wiraswasta', 'Ibu Fulanah', 'IRT',
    "'081234567890", 'emailwali@gmail.com', 'SD/MI', '45', '160',
    '2026', 'Jawa Timur', 'Malang', 'Ngadiluwih', 'Purwokerto'
  ];

  const ws = xlsx.utils.aoa_to_sheet([headers, sample]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Template Santri");
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  const row = data[0];
  console.log("Parsed Row:", row);
  
  const getValue = (row, keys) => {
    const rowKeys = Object.keys(row);
    for (const key of keys) {
      const foundKey = rowKeys.find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
      if (foundKey) return row[foundKey];
    }
    return undefined;
  };
  
  const parseDate = (val) => {
    if (!val) return undefined;
    if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? undefined : d;
    }
    if (typeof val === 'string') {
      if (val.includes('-') || val.includes('/')) {
        const parts = val.split(/[-/]/);
        if (parts.length === 3) {
           let day, month, year;
           if (parts[0].length === 4) { year = parseInt(parts[0]); month = parseInt(parts[1]) - 1; day = parseInt(parts[2]); } 
           else { day = parseInt(parts[0]); month = parseInt(parts[1]) - 1; year = parseInt(parts[2]); if (year < 100) year += 2000; }
           const d = new Date(year, month, day);
           if (!isNaN(d.getTime())) return d;
        }
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    return undefined;
  };

  const parsedBirthDate = parseDate(getValue(row, ['Tanggal Lahir', 'birth_date', 'DoB']));
  console.log("Parsed Birth Date:", parsedBirthDate);

  const nik = getValue(row, ['NIK', 'nik', 'No. KTP']);
  console.log("NIK raw:", nik);
}

testImport();
