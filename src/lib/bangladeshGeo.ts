// ── Bangladesh district → thana (upazilla) data via the open-source bdapis.com API ──
import { useEffect, useState } from 'react';

// One request per division (8 total, fetched in parallel, session-cached):
//   GET https://bdapis.com/api/v1.2/division/{division-slug}
// Every district entry in the response carries its full upazilla (thana) list.
// District names are mapped to the exact DELIVERY_ZONES spellings used by
// checkout + Steadfast zone pricing, so the same values keep flowing through
// the app (customer_address, delivery_zone, courier booking).
//
// RESILIENCE: bdapis is a free API — it can be down, rate-limited, or return
// empty upazilla lists. When that happens the embedded FALLBACK_THANAS
// snapshot below (captured from the API) is used, so EVERY district always
// has a thana list in checkout and Manual Orders. Districts the API never
// covers at all (Savar / Dhamrai / Keraniganj — they are upazillas of Dhaka
// district, and bdapis only knows districts) ship curated union lists.

const API_BASE = 'https://bdapis.com/api/v1.2/division';
const CACHE_KEY = 'ornix_geo_thanas_v3'; // sessionStorage cache (bumped when data changes)
const MIN_DISTRICTS = 60; // Bangladesh has 64 — guard against partial data

const DIVISION_SLUGS = ['barishal', 'chattogram', 'dhaka', 'khulna', 'mymensingh', 'rajshahi', 'rangpur', 'sylhet'];

// bdapis spellings that differ from the app's (Steadfast/ZoneSelect) district names
const DISTRICT_ALIASES: Record<string, string> = {
  "cox's bazar": 'Cox’s Bazar', // ASCII apostrophe → the app's U+2019 spelling
  jhalokati: 'Jhalokathi',
  khagrachari: 'Khagrachhari',
  'chapai nawabganj': 'Chapainawabganj',
};

/**
 * Curated thana lists for app-level "districts" the bdapis API doesn't cover:
 * - 'Dhaka City' → the 50 Dhaka Metropolitan Police thanas
 *   (bdapis only knows administrative upazillas; metropolitan thanas are
 *   what customers actually use for addresses inside the city)
 * - 'Dhaka Suburban' → the Dhaka-district upazillas outside the city
 *   (Savar/Dhamrai/Keraniganj also exist as their own dropdown options —
 *   listing them here too keeps the suburban catch-all usable)
 * - 'Savar' / 'Dhamrai' / 'Keraniganj' → the union parishads of those
 *   upazilas (bdapis has no district entry for them; unions are the level
 *   customers actually use). Sources: Banglapedia + Wikipedia union lists.
 * Keys must match ZoneSelect district values exactly; every entry pairs the
 * stored English name with its Bangla label for the Bengali checkout.
 */
export type SpecialThana = { name: string; bn: string };
export const SPECIAL_THANA_LISTS: Record<string, SpecialThana[]> = {
  'Dhaka City': [
    { name: 'Adabor', bn: 'আদাবর' },
    { name: 'Airport', bn: 'এয়ারপোর্ট' },
    { name: 'Badda', bn: 'বাড্ডা' },
    { name: 'Banani', bn: 'বনানী' },
    { name: 'Bangshal', bn: 'বাংশাল' },
    { name: 'Bhashantek', bn: 'ভাসানটেক' },
    { name: 'Bimanbandar', bn: 'বিমানবন্দর' },
    { name: 'Cantonment', bn: 'ক্যান্টনমেন্ট' },
    { name: 'Chalkbazar', bn: 'চকবাজার' },
    { name: 'Dakshinkhan', bn: 'দক্ষিণখান' },
    { name: 'Darus Salam', bn: 'দারুস সালাম' },
    { name: 'Demra', bn: 'ডেমরা' },
    { name: 'Dhanmondi', bn: 'ধানমন্ডি' },
    { name: 'Gendaria', bn: 'জিন্দারিয়া' },
    { name: 'Gulshan', bn: 'গুলশান' },
    { name: 'Hatirjheel', bn: 'হাতিরঝিল' },
    { name: 'Hazaribagh', bn: 'হাজারীবাগ' },
    { name: 'Jatrabari', bn: 'যাত্রাবাড়ী' },
    { name: 'Kadamtali', bn: 'কদমতলী' },
    { name: 'Kafrul', bn: 'কাফরুল' },
    { name: 'Kalabagan', bn: 'কলাবাগান' },
    { name: 'Kamrangirchar', bn: 'কামরাঙ্গীরচর' },
    { name: 'Khilgaon', bn: 'খিলগাঁও' },
    { name: 'Khilkhet', bn: 'খিলক্ষেত' },
    { name: 'Kotwali', bn: 'কোতোয়ালী' },
    { name: 'Lalbagh', bn: 'লালবাগ' },
    { name: 'Mirpur', bn: 'মিরপুর' },
    { name: 'Mohammadpur', bn: 'মোহাম্মদপুর' },
    { name: 'Motijheel', bn: 'মতিঝিল' },
    { name: 'Mugda', bn: 'মুগদা' },
    { name: 'New Market', bn: 'নিউ মার্কেট' },
    { name: 'Pallabi', bn: 'পল্লবী' },
    { name: 'Paltan', bn: 'পল্টন' },
    { name: 'Ramna', bn: 'রমনা' },
    { name: 'Rampura', bn: 'রামপুরা' },
    { name: 'Sabujbagh', bn: 'সবুজবাগ' },
    { name: 'Shah Ali', bn: 'শাহ আলী' },
    { name: 'Shahbagh', bn: 'শাহবাগ' },
    { name: 'Shahjahanpur', bn: 'শাহজাহানপুর' },
    { name: 'Sher-e-Bangla Nagar', bn: 'শেরেবাংলা নগর' },
    { name: 'Shyampur', bn: 'শ্যামপুর' },
    { name: 'Sutrapur', bn: 'সূত্রাপুর' },
    { name: 'Tejgaon', bn: 'তেজগাঁও' },
    { name: 'Tejgaon Industrial Area', bn: 'তেজগাঁও শিল্পাঞ্চল' },
    { name: 'Turag', bn: 'তুরাগ' },
    { name: 'Uttar Khan', bn: 'উত্তরখান' },
    { name: 'Uttara East', bn: 'উত্তরা পূর্ব' },
    { name: 'Uttara West', bn: 'উত্তরা পশ্চিম' },
    { name: 'Vatara', bn: 'ভাটারা' },
    { name: 'Wari', bn: 'ওয়ারী' },
  ],
  'Dhaka Suburban': [
    { name: 'Dhamrai', bn: 'ধামরাই' },
    { name: 'Dohar', bn: 'দোহার' },
    { name: 'Keraniganj', bn: 'কেরানীগঞ্জ' },
    { name: 'Nawabganj', bn: 'নবাবগঞ্জ' },
    { name: 'Savar', bn: 'সাভার' },
  ],
  'Savar': [
    { name: 'Aminbazar', bn: 'আমিনবাজার' },
    { name: 'Ashulia', bn: 'আশুলিয়া' },
    { name: 'Bakunda', bn: 'বাকুন্দা' },
    { name: 'Birulia', bn: 'বিরুলিয়া' },
    { name: 'Dhamsana', bn: 'ধামসানা' },
    { name: 'Genda', bn: 'গেন্ডা' },
    { name: 'Hemayetpur', bn: 'হেমায়েতপুর' },
    { name: 'Kaundia', bn: 'কাউন্দিয়া' },
    { name: 'Pathalia', bn: 'পাথালিয়া' },
    { name: 'Savar Sadar', bn: 'সাভার সদর' },
    { name: 'Shimulia', bn: 'শিমুলিয়া' },
    { name: 'Tetuljhora', bn: 'তেতুলঝোড়া' },
    { name: 'Yearpur', bn: 'ইয়ারপুর' },
  ],
  'Dhamrai': [
    { name: 'Amta', bn: 'আমতা' },
    { name: 'Baisakanda', bn: 'বাইশাকান্দা' },
    { name: 'Balia', bn: 'বালিয়া' },
    { name: 'Bhararia', bn: 'ভারারিয়া' },
    { name: 'Chauhat', bn: 'চৌহাট' },
    { name: 'Dhamrai Sadar', bn: 'ধামরাই সদর' },
    { name: 'Gangutia', bn: 'গঙ্গুটিয়া' },
    { name: 'Jadabpur', bn: 'যদবপুর' },
    { name: 'Kulla', bn: 'কুল্লা' },
    { name: 'Kushura', bn: 'কুশুরা' },
    { name: 'Nannar', bn: 'নান্নার' },
    { name: 'Rowail', bn: 'রায়ইল' },
    { name: 'Sanora', bn: 'সানোরা' },
    { name: 'Sombhog', bn: 'সম্ভাগ' },
    { name: 'Suapur', bn: 'সুয়াপুর' },
    { name: 'Sutipara', bn: 'সুতিপাড়া' },
  ],
  'Keraniganj': [
    { name: 'Aganagar', bn: 'আগানগর' },
    { name: 'Basta', bn: 'বাস্তা' },
    { name: 'Hazratpur', bn: 'হযরতপুর' },
    { name: 'Jinjira', bn: 'জিনজিরা' },
    { name: 'Kalatia', bn: 'কলাতিয়া' },
    { name: 'Kalindi', bn: 'কালিন্দী' },
    { name: 'Konda', bn: 'কোণ্ডা' },
    { name: 'Rohitpur', bn: 'রোহিতপুর' },
    { name: 'Shakta', bn: 'শাক্তা' },
    { name: 'Shubhadya', bn: 'শুভাঢ্যা' },
    { name: 'Taranagar', bn: 'তারানগর' },
    { name: 'Tegharia', bn: 'তেঘরিয়া' },
  ],
};

/**
 * OFFLINE SNAPSHOT — every district's thana list, captured from the bdapis
 * API. Used (a) as a per-district patch when the API returns an empty list,
 * and (b) wholesale when the API is unreachable. Keys use the app's exact
 * district spellings. Keep in sync with bdapis data if it ever updates.
 */
const FALLBACK_THANAS: Record<string, string[]> = {
  // Barishal division
  'Barguna': ['Amtali', 'Bamna', 'Barguna Sadar', 'Betagi', 'Patharghata', 'Taltali'],
  'Barishal': ['Agailjhara', 'Babuganj', 'Bakerganj', 'Banaripara', 'Barisal Sadar', 'Gaurnadi', 'Hizla', 'Mehendiganj', 'Muladi', 'Wazirpur'],
  'Bhola': ['Bhola Sadar', 'Burhanuddin', 'Char Fasson', 'Daulatkhan', 'Lalmohan', 'Manpura', 'Tazumuddin'],
  'Jhalokathi': ['Kathalia', 'Nalchhiti', 'Jhalokati Sadar', 'Rajapur'],
  'Patuakhali': ['Bauphal', 'Dashmina', 'Dumki', 'Galachipa', 'Kalapara', 'Mirzaganj', 'Patuakhali Sadar', 'Rangabali'],
  'Pirojpur': ['Bhandaria', 'Indurkani', 'Kawkhali', 'Mathbaria', 'Nazirpur', 'Nesarabad (Swarupkati)', 'Pirojpur Sadar'],
  // Chattogram division
  'Bandarban': ['Ali Kadam', 'Bandarban Sadar', 'Lama', 'Naikhongchhari', 'Rowangchhari', 'Ruma', 'Thanchi'],
  'Brahmanbaria': ['Akhaura', 'Ashuganj', 'Bancharampur', 'Brahmanbaria Sadar', 'Bijoynagar', 'Kasba', 'Nabinagar', 'Nasirnagar', 'Sarail'],
  'Chandpur': ['Chandpur Sadar', 'Faridganj', 'Haimchar', 'Haziganj', 'Kachua', 'Matlab Dakshin', 'Matlab Uttar', 'Shahrasti'],
  'Chattogram': ['Anwara', 'Banshkhali', 'Boalkhali', 'Chandanaish', 'Fatikchhari', 'Hathazari', 'Karnaphuli', 'Lohagara', 'Mirsharai', 'Patiya', 'Rangunia', 'Raozan', 'Sandwip', 'Satkania', 'Sitakunda'],
  'Cox’s Bazar': ['Chakaria', 'Cox’s Bazar Sadar', 'Kutubdia', 'Maheshkhali', 'Pekua', 'Ramu', 'Teknaf', 'Ukhia'],
  'Cumilla': ['Barura', 'Brahmanpara', 'Burichang', 'Chandina', 'Chauddagram', 'Cumilla Adarsha Sadar', 'Cumilla Sadar Dakshin', 'Daudkandi', 'Debidwar', 'Homna', 'Laksam', 'Lalmai', 'Meghna', 'Monohargonj', 'Muradnagar', 'Nangalkot', 'Titas'],
  'Feni': ['Chhagalnaiya', 'Daganbhuiyan', 'Feni Sadar', 'Fulgazi', 'Parshuram', 'Sonagazi'],
  'Khagrachhari': ['Dighinala', 'Khagrachhari Sadar', 'Lakshmichhari', 'Mahalchhari', 'Manikchhari', 'Matiranga', 'Panchhari', 'Ramgarh'],
  'Lakshmipur': ['Kamalnagar', 'Lakshmipur Sadar', 'Raipur', 'Ramganj', 'Ramgati'],
  'Noakhali': ['Begumganj', 'Chatkhil', 'Companiganj', 'Hatiya', 'Kabirhat', 'Noakhali Sadar', 'Senbagh', 'Sonaimuri', 'Subarnachar'],
  'Rangamati': ['Bagaichhari', 'Barkal', 'Belaichhari', 'Juraichhari', 'Kaptai', 'Kawkhali', 'Langadu', 'Naniyachar', 'Rajasthali', 'Rangamati Sadar'],
  // Rajshahi division
  'Bogura': ['Adamdighi', 'Bogura Sadar', 'Dhunat', 'Dhupchanchia', 'Gabtali', 'Kahaloo', 'Nandigram', 'Sariakandi', 'Shajahanpur', 'Sherpur', 'Shibganj', 'Sonatola'],
  'Joypurhat': ['Akkelpur', 'Joypurhat Sadar', 'Kalai', 'Khetlal', 'Panchbibi'],
  'Naogaon': ['Atrai', 'Badalgachhi', 'Dhamoirhat', 'Manda', 'Mohadevpur', 'Naogaon Sadar', 'Niamatpur', 'Patnitala', 'Porsha', 'Raninagar', 'Sapahar'],
  'Natore': ['Bagatipara', 'Baraigram', 'Gurudaspur', 'Lalpur', 'Naldanga', 'Natore Sadar', 'Singra'],
  'Chapainawabganj': ['Bholahat', 'Chapai Nawabganj Sadar', 'Gomastapur', 'Nachole', 'Shibganj'],
  'Pabna': ['Atgharia', 'Bera', 'Bhangura', 'Chatmohar', 'Faridpur', 'Ishwardi', 'Pabna Sadar', 'Santhia', 'Sujanagar'],
  'Rajshahi': ['Bagha', 'Bagmara', 'Charghat', 'Durgapur', 'Godagari', 'Mohanpur', 'Paba', 'Puthia', 'Tanore'],
  'Sirajganj': ['Belkuchi', 'Chauhali', 'Kamarkhanda', 'Kazipur', 'Raiganj', 'Shahjadpur', 'Sirajganj Sadar', 'Tarash', 'Ullahpara'],
  // Rangpur division
  'Dinajpur': ['Birampur', 'Birganj', 'Biral', 'Bochaganj', 'Chirirbandar', 'Dinajpur Sadar', 'Ghoraghat', 'Hakimpur', 'Kaharole', 'Khansama', 'Nawabganj', 'Parbatipur', 'Phulbari'],
  'Gaibandha': ['Gaibandha Sadar', 'Gobindaganj', 'Palashbari', 'Phulchhari', 'Sadullapur', 'Sughatta', 'Sundarganj'],
  'Kurigram': ['Bhurungamari', 'Char Rajibpur', 'Chilmari', 'Kurigram Sadar', 'Nageshwari', 'Phulbari', 'Rajarhat', 'Raomari', 'Ulipur'],
  'Lalmonirhat': ['Aditmari', 'Hatibandha', 'Kaliganj', 'Lalmonirhat Sadar', 'Patgram'],
  'Nilphamari': ['Dimla', 'Domar', 'Jaldhaka', 'Kishoreganj', 'Nilphamari Sadar', 'Saidpur'],
  'Panchagarh': ['Atwari', 'Boda', 'Debiganj', 'Panchagarh Sadar', 'Tetulia'],
  'Rangpur': ['Badarganj', 'Gangachhara', 'Kaunia', 'Mithapukur', 'Pirgachha', 'Pirganj', 'Rangpur Sadar', 'Taraganj'],
  'Thakurgaon': ['Baliadangi', 'Haripur', 'Pirganj', 'Ranisankail', 'Thakurgaon Sadar'],
  // Khulna division
  'Bagerhat': ['Bagerhat Sadar', 'Chitalmari', 'Fakirhat', 'Kachua', 'Mollahat', 'Mongla', 'Morrelganj', 'Rampal', 'Sarankhola'],
  'Chuadanga': ['Alamdanga', 'Chuadanga Sadar', 'Damurhuda', 'Jibannagar'],
  'Jashore': ['Abhaynagar', 'Bagherpara', 'Chaugachha', 'Jashore Sadar', 'Jhikargachha', 'Keshabpur', 'Manirampur', 'Sharsha'],
  'Jhenaidah': ['Harinakunda', 'Jhenaidah Sadar', 'Kaliganj', 'Kotchandpur', 'Maheshpur', 'Shailkupa'],
  'Khulna': ['Batiaghata', 'Dacope', 'Dighalia', 'Dumuria', 'Koyra', 'Paikgachha', 'Phultala', 'Rupsha', 'Terokhada'],
  'Kushtia': ['Bheramara', 'Daulatpur', 'Khoksa', 'Kumarkhali', 'Kushtia Sadar', 'Mirpur'],
  'Magura': ['Magura Sadar', 'Mohammadpur', 'Shalikha', 'Sreepur'],
  'Meherpur': ['Gangni', 'Meherpur Sadar', 'Mujibnagar'],
  'Narail': ['Kalia', 'Lohagara', 'Narail Sadar'],
  'Satkhira': ['Assasuni', 'Debhata', 'Kalaroa', 'Kaliganj', 'Satkhira Sadar', 'Shyamnagar', 'Tala'],
  // Mymensingh division
  'Jamalpur': ['Baksiganj', 'Dewanganj', 'Islampur', 'Jamalpur Sadar', 'Madarganj', 'Melandaha', 'Sarishabari'],
  'Mymensingh': ['Bhaluka', 'Dhobaura', 'Fulbaria', 'Gafargaon', 'Gauripur', 'Haluaghat', 'Ishwarganj', 'Mymensingh Sadar', 'Muktagachha', 'Nandail', 'Phulpur', 'Tara Khanda', 'Trishal'],
  'Netrokona': ['Atpara', 'Barhatta', 'Durgapur', 'Kalmakanda', 'Kendua', 'Khaliajuri', 'Madan', 'Mohanganj', 'Netrokona Sadar', 'Purbadhala'],
  'Sherpur': ['Jhenaigati', 'Nakla', 'Nalitabari', 'Sherpur Sadar', 'Sreebardi'],
  // Dhaka division (Dhaka City / Dhaka Suburban / Savar / Dhamrai / Keraniganj are curated above)
  'Savar': ['Aminbazar', 'Ashulia', 'Bakunda', 'Birulia', 'Dhamsana', 'Genda', 'Hemayetpur', 'Kaundia', 'Pathalia', 'Savar Sadar', 'Shimulia', 'Tetuljhora', 'Yearpur'],
  'Dhamrai': ['Amta', 'Baisakanda', 'Balia', 'Bhararia', 'Chauhat', 'Dhamrai Sadar', 'Gangutia', 'Jadabpur', 'Kulla', 'Kushura', 'Nannar', 'Rowail', 'Sanora', 'Sombhog', 'Suapur', 'Sutipara'],
  'Keraniganj': ['Aganagar', 'Basta', 'Hazratpur', 'Jinjira', 'Kalatia', 'Kalindi', 'Konda', 'Rohitpur', 'Shakta', 'Shubhadya', 'Taranagar', 'Tegharia'],
  'Faridpur': ['Alfadanga', 'Bhanga', 'Boalmari', 'Charbhadrasan', 'Faridpur Sadar', 'Madhukhali', 'Nagarkanda', 'Sadarpur', 'Saltha'],
  'Gazipur': ['Gazipur Sadar', 'Kaliakair', 'Kaliganj', 'Kapasia', 'Sreepur'],
  'Gopalganj': ['Gopalganj Sadar', 'Kashiani', 'Kotalipara', 'Muksudpur', 'Tungipara'],
  'Kishoreganj': ['Austagram', 'Bajitpur', 'Bhairab', 'Hossainpur', 'Itna', 'Karimganj', 'Katiadi', 'Kishoreganj Sadar', 'Kuliarchar', 'Mithamain', 'Nikli', 'Pakundia', 'Tarail'],
  'Madaripur': ['Kalkini', 'Madaripur Sadar', 'Rajoir', 'Shibchar'],
  'Manikganj': ['Daulatpur', 'Ghior', 'Harirampur', 'Manikgonj Sadar', 'Saturia', 'Shivalaya', 'Singair'],
  'Munshiganj': ['Gazaria', 'Lohajang', 'Munshiganj Sadar', 'Sirajdikhan', 'Sreenagar', 'Tongibari'],
  'Narayanganj': ['Araihazar', 'Bandar', 'Narayanganj Sadar', 'Rupganj', 'Sonargaon'],
  'Narsingdi': ['Belabo', 'Monohardi', 'Narsingdi Sadar', 'Palash', 'Raipura', 'Shibpur'],
  'Rajbari': ['Baliakandi', 'Goalandaghat', 'Kalukhali', 'Pangsha', 'Rajbari Sadar'],
  'Shariatpur': ['Bhedarganj', 'Damudya', 'Gosairhat', 'Naria', 'Shariatpur Sadar', 'Zajira'],
  'Tangail': ['Basail', 'Bhuapur', 'Delduar', 'Dhanbari', 'Ghatail', 'Gopalpur', 'Kalihati', 'Madhupur', 'Mirzapur', 'Nagarpur', 'Sakhipur', 'Tangail Sadar'],
  // Sylhet division
  'Habiganj': ['Ajmiriganj', 'Bahubal', 'Baniyachong', 'Chunarughat', 'Habiganj Sadar', 'Lakhai', 'Madhabpur', 'Nabiganj', 'Sayestaganj'],
  'Moulvibazar': ['Barlekha', 'Juri', 'Kamalganj', 'Kulaura', 'Moulvibazar Sadar', 'Rajnagar', 'Sreemangal'],
  'Sunamganj': ['Bishwamvarpur', 'Chhatak', 'Dakshin Sunamganj', 'Derai', 'Dharamapasha', 'Dowarabazar', 'Jagannathpur', 'Jamalganj', 'Sullah', 'Sunamganj Sadar', 'Tahirpur'],
  'Sylhet': ['Balaganj', 'Beanibazar', 'Bishwanath', 'Companigonj', 'Dakshin Surma', 'Fenchuganj', 'Golapganj', 'Gowainghat', 'Jaintiapur', 'Kanaighat', 'Osmani Nagar', 'Sylhet Sadar', 'Zakiganj'],
};

type BdapisRow = { district?: string; upazilla?: string[] };
type BdapisBody = { data?: BdapisRow[] };

function readCache(): Record<string, string[]> | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length >= MIN_DISTRICTS) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCache(map: Record<string, string[]>): void {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — data is simply re-fetched next time
  }
}

/**
 * Merge the curated lists (Dhaka City / Dhaka Suburban / Savar / Dhamrai /
 * Keraniganj) into an API map. Returns a NEW object — never mutates the
 * caller's map.
 */
function withSpecialLists(map: Record<string, string[]>): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...map };
  for (const [key, entries] of Object.entries(SPECIAL_THANA_LISTS)) {
    if (!merged[key]?.length) merged[key] = entries.map((e) => e.name);
  }
  return merged;
}

/** Apply the same normalization the live fetch uses to the offline snapshot. */
function normalizeFallback(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, thanas] of Object.entries(FALLBACK_THANAS)) {
    out[key] = [...new Set(thanas)].sort((a, b) => a.localeCompare(b));
  }
  // Store under both apostrophe variants so lookups always hit
  for (const [key, thanas] of Object.entries(out)) {
    if (key.includes('’') && !out[key.replace(/’/g, "'")]) out[key.replace(/’/g, "'")] = thanas;
    if (key.includes("'") && !out[key.replace(/'/g, '’')]) out[key.replace(/'/g, '’')] = thanas;
  }
  return out;
}

/**
 * Fetch thana lists for every district, keyed by the app's district names.
 * Never throws for data reasons: if the API is unreachable or incomplete,
 * the embedded FALLBACK_THANAS snapshot fills every gap, so callers always
 * get a complete district → thanas map.
 */
export async function fetchAllDistrictThanas(): Promise<Record<string, string[]>> {
  const cached = readCache();
  if (cached) return withSpecialLists(cached);

  const map: Record<string, string[]> = {};
  let apiOk = false;
  try {
    const responses: BdapisBody[] = await Promise.all(
      DIVISION_SLUGS.map(async (slug) => {
        const res = await fetch(`${API_BASE}/${slug}`);
        if (!res.ok) throw new Error(`bdapis (${slug}) responded ${res.status}`);
        return (await res.json()) as BdapisBody;
      })
    );
    for (const body of responses) {
      for (const row of body.data ?? []) {
        const apiName = (row.district ?? '').trim();
        if (!apiName) continue;
        const key = DISTRICT_ALIASES[apiName.toLowerCase()] ?? apiName;
        const thanas = [...new Set((row.upazilla ?? []).map((u) => u.trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b));
        map[key] = thanas;
      }
    }
    apiOk = Object.keys(map).length >= MIN_DISTRICTS;
  } catch {
    apiOk = false; // API down — the snapshot below takes over
  }

  if (!apiOk) {
    // API unreachable/incomplete → use the complete offline snapshot.
    const fallback = normalizeFallback();
    writeCache(fallback);
    return withSpecialLists(fallback);
  }

  // API responded — patch any district it left empty from the snapshot.
  const fallback = normalizeFallback();
  for (const [key, thanas] of Object.entries(fallback)) {
    if (!map[key]?.length) map[key] = thanas;
  }

  // Store under both apostrophe variants so lookups always hit
  for (const [key, thanas] of Object.entries(map)) {
    if (key.includes('’') && !map[key.replace(/’/g, "'")]) map[key.replace(/’/g, "'")] = thanas;
    if (key.includes("'") && !map[key.replace(/'/g, '’')]) map[key.replace(/'/g, '’')] = thanas;
  }

  writeCache(map);
  return withSpecialLists(map);
}

/** React hook: loads all thana lists once per page (sessionStorage-cached). */
export function useDistrictThanas(): {
  thanasByDistrict: Record<string, string[]>;
  loading: boolean;
  error: string | null;
} {
  // Shared session cache + in-flight promise keep checkout and admin in sync
  const [thanasByDistrict, setThanasByDistrict] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Curated lists (Dhaka City / Dhaka Suburban / Savar / Dhamrai / Keraniganj)
    // render immediately, even while the API data is still loading.
    setThanasByDistrict(
      Object.fromEntries(Object.entries(SPECIAL_THANA_LISTS).map(([k, v]) => [k, v.map((e) => e.name)]))
    );
    fetchAllDistrictThanas()
      .then((map) => {
        if (!alive) return;
        setThanasByDistrict(map);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load thana list');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { thanasByDistrict, loading, error };
}
