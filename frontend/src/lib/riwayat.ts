/**
 * The ten canonical readers (al-qurra' al-'ashara) and their two transmitters each — 20 riwayat.
 * The stored value is the Arabic name (e.g. "حفص عن عاصم"); English labels are for the EN interface.
 * The four most widespread riwayat are listed first for quick selection.
 */
export interface Riwayah { value: string; en: string }
export interface RiwayahGroup { imam_ar: string; imam_en: string; riwayat: Riwayah[] }

export const COMMON_RIWAYAT: Riwayah[] = [
  { value: 'حفص عن عاصم', en: 'Hafs from Asim' },
  { value: 'ورش عن نافع', en: 'Warsh from Nafi' },
  { value: 'قالون عن نافع', en: 'Qalun from Nafi' },
  { value: 'الدوري عن أبي عمرو', en: 'al-Duri from Abu Amr' },
];

export const RIWAYAT_GROUPS: RiwayahGroup[] = [
  { imam_ar: 'نافع المدني', imam_en: 'Nafi of Madinah', riwayat: [
    { value: 'قالون عن نافع', en: 'Qalun from Nafi' }, { value: 'ورش عن نافع', en: 'Warsh from Nafi' }] },
  { imam_ar: 'ابن كثير المكي', imam_en: 'Ibn Kathir of Makkah', riwayat: [
    { value: 'البزي عن ابن كثير', en: 'al-Bazzi from Ibn Kathir' }, { value: 'قنبل عن ابن كثير', en: 'Qunbul from Ibn Kathir' }] },
  { imam_ar: 'أبو عمرو البصري', imam_en: 'Abu Amr of Basra', riwayat: [
    { value: 'الدوري عن أبي عمرو', en: 'al-Duri from Abu Amr' }, { value: 'السوسي عن أبي عمرو', en: 'al-Susi from Abu Amr' }] },
  { imam_ar: 'ابن عامر الشامي', imam_en: 'Ibn Amir of Damascus', riwayat: [
    { value: 'هشام عن ابن عامر', en: 'Hisham from Ibn Amir' }, { value: 'ابن ذكوان عن ابن عامر', en: 'Ibn Dhakwan from Ibn Amir' }] },
  { imam_ar: 'عاصم الكوفي', imam_en: 'Asim of Kufa', riwayat: [
    { value: 'شعبة عن عاصم', en: "Shu'bah from Asim" }, { value: 'حفص عن عاصم', en: 'Hafs from Asim' }] },
  { imam_ar: 'حمزة الكوفي', imam_en: 'Hamzah of Kufa', riwayat: [
    { value: 'خلف عن حمزة', en: 'Khalaf from Hamzah' }, { value: 'خلاد عن حمزة', en: 'Khallad from Hamzah' }] },
  { imam_ar: 'الكسائي', imam_en: "al-Kisa'i", riwayat: [
    { value: 'أبو الحارث عن الكسائي', en: "Abu al-Harith from al-Kisa'i" }, { value: 'الدوري عن الكسائي', en: "al-Duri from al-Kisa'i" }] },
  { imam_ar: 'أبو جعفر المدني', imam_en: "Abu Ja'far of Madinah", riwayat: [
    { value: 'ابن وردان عن أبي جعفر', en: "Ibn Wardan from Abu Ja'far" }, { value: 'ابن جماز عن أبي جعفر', en: "Ibn Jammaz from Abu Ja'far" }] },
  { imam_ar: 'يعقوب الحضرمي', imam_en: "Ya'qub al-Hadrami", riwayat: [
    { value: 'رويس عن يعقوب', en: "Ruways from Ya'qub" }, { value: 'روح عن يعقوب', en: "Rawh from Ya'qub" }] },
  { imam_ar: 'خلف العاشر', imam_en: 'Khalaf al-Ashir', riwayat: [
    { value: 'إسحاق عن خلف العاشر', en: 'Ishaq from Khalaf' }, { value: 'إدريس عن خلف العاشر', en: 'Idris from Khalaf' }] },
];

export const DEFAULT_RIWAYAH = 'حفص عن عاصم';

export const ALL_RIWAYAT: Riwayah[] = RIWAYAT_GROUPS.flatMap((g) => g.riwayat);
