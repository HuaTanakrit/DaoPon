export interface ClubStyle { color: string; code: string; thai: string }
const clubs: Record<number, ClubStyle> = {
  33: { color: '#db3335', code: 'MUN', thai: 'แมนเชสเตอร์ ยูไนเต็ด' },
  34: { color: '#263b53', code: 'NEW', thai: 'นิวคาสเซิล' },
  35: { color: '#ee7740', code: 'BOU', thai: 'บอร์นมัธ' },
  36: { color: '#c75a36', code: 'FUL', thai: 'ฟูแล่ม' },
  39: { color: '#ca574f', code: 'WOL', thai: 'วูล์ฟแฮมป์ตัน' },
  40: { color: '#cf303c', code: 'LIV', thai: 'ลิเวอร์พูล' },
  41: { color: '#dd473e', code: 'SOU', thai: 'เซาแธมป์ตัน' },
  42: { color: '#df3840', code: 'ARS', thai: 'อาร์เซนอล อาร์เซน่อล' },
  45: { color: '#226ac4', code: 'EVE', thai: 'เอฟเวอร์ตัน' },
  46: { color: '#263d69', code: 'LEI', thai: 'เลสเตอร์' },
  47: { color: '#313d59', code: 'TOT', thai: 'ท็อตแนม สเปอร์ส' },
  48: { color: '#974664', code: 'WHU', thai: 'เวสต์แฮม' },
  49: { color: '#2b62bc', code: 'CHE', thai: 'เชลซี' },
  50: { color: '#4291b7', code: 'MCI', thai: 'แมนเชสเตอร์ ซิตี้' },
  51: { color: '#3b7caf', code: 'BHA', thai: 'ไบรท์ตัน ไบรตัน' },
  52: { color: '#385a9b', code: 'CRY', thai: 'คริสตัล พาเลซ' },
  55: { color: '#ce4a40', code: 'BRE', thai: 'เบรนท์ฟอร์ด' },
  57: { color: '#254f95', code: 'IPS', thai: 'อิปสวิช' },
  65: { color: '#b14d67', code: 'NFO', thai: 'น็อตติงแฮม ฟอเรสต์' },
  66: { color: '#7c3d67', code: 'AVL', thai: 'แอสตัน วิลลา วิลล่า' },
};
export const clubStyle = (id: number): ClubStyle => clubs[id] || { color: '#22644b', code: 'CLUB', thai: '' };
