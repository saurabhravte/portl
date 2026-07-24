/**
 * Guard-first language support + training mode (sprint ticket #17 — P2).
 *
 * The plan flags low English literacy as an adoption risk for guards, so
 * guard-facing screens render in Hindi when selected. Training mode lets a
 * guard practice the flows during the 15-minute onboarding session without
 * polluting real gate logs — actions are simulated, nothing is written.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Lang = "en" | "hi";

const en = {
  gate: "Gate",
  waiting_at_gate: "Waiting at gate",
  gate_clear: "Gate is clear",
  gate_clear_hint: "New visitor requests show here live.",
  inside_now: "Inside now",
  nobody_inside: "Nobody inside",
  mark_entry: "Mark entry",
  mark_exit: "Mark exit",
  expected_today: "Expected today",
  new_visitor: "New visitor",
  visitor_name: "Visitor name",
  name_placeholder: "Name or company",
  phone_optional: "Phone (optional)",
  vehicle_optional: "Vehicle number (optional)",
  add_photo: "Add photo (optional)",
  change_photo: "Change photo",
  flat: "Flat",
  flat_placeholder: "Flat number or resident name",
  ask_resident: "Ask resident →",
  auto_submit: "Submit & auto-approve →",
  missing_info: "Missing info",
  missing_info_hint: "Enter a name and pick the flat.",
  have_code: "Have a code?",
  verify_code: "Verify and let in",
  scan_qr: "Scan QR instead",
  type_code: "Type code instead",
  six_digits: "6 digits",
  six_digits_hint: "The gate code is always 6 digits.",
  not_valid: "Not valid",
  entry_logged: "Entry logged.",
  offline_banner: "Offline — gate actions will be saved and synced",
  queued_actions: "queued",
  training_on: "Training mode — nothing is saved",
  waiting: "WAITING",
  approved: "APPROVED",
  auto: "AUTO",
  sent: "Sent",
  sent_hint: "Resident has been asked. Watch the Gate tab for the green tick.",
  auto_approved: "Auto-approved",
  auto_approved_hint: "No resident wait — mark entry on the Gate tab.",
  queued_title: "Saved offline",
  queued_hint: "You're offline. This will be sent automatically when the network is back.",
  retry: "Retry",
  cancel: "Cancel",
  camera_needed_title: "Camera needed",
  camera_needed_hint: "Allow camera access to scan visitor QR codes.",
  language: "Language",
  training_mode: "Training mode",
  training_mode_hint: "Practice all gate flows — nothing is saved.",
  check_updates: "Check for app updates",
  admin_override: "Admin override",
  expired: "EXPIRED",
} as const;

export type TKey = keyof typeof en;

const hi: Record<TKey, string> = {
  gate: "गेट",
  waiting_at_gate: "गेट पर प्रतीक्षा में",
  gate_clear: "गेट खाली है",
  gate_clear_hint: "नई विज़िटर रिक्वेस्ट यहाँ तुरंत दिखेंगी।",
  inside_now: "अभी अंदर",
  nobody_inside: "कोई अंदर नहीं",
  mark_entry: "एंट्री दर्ज करें",
  mark_exit: "एग्ज़िट दर्ज करें",
  expected_today: "आज अपेक्षित",
  new_visitor: "नया विज़िटर",
  visitor_name: "विज़िटर का नाम",
  name_placeholder: "नाम या कंपनी",
  phone_optional: "फ़ोन (वैकल्पिक)",
  vehicle_optional: "गाड़ी नंबर (वैकल्पिक)",
  add_photo: "फ़ोटो जोड़ें (वैकल्पिक)",
  change_photo: "फ़ोटो बदलें",
  flat: "फ्लैट",
  flat_placeholder: "फ्लैट नंबर या निवासी का नाम",
  ask_resident: "निवासी से पूछें →",
  auto_submit: "भेजें — ऑटो-अप्रूव →",
  missing_info: "जानकारी अधूरी है",
  missing_info_hint: "नाम लिखें और फ्लैट चुनें।",
  have_code: "कोड है?",
  verify_code: "कोड जाँचें और अंदर जाने दें",
  scan_qr: "QR स्कैन करें",
  type_code: "कोड टाइप करें",
  six_digits: "6 अंक",
  six_digits_hint: "गेट कोड हमेशा 6 अंकों का होता है।",
  not_valid: "मान्य नहीं",
  entry_logged: "एंट्री दर्ज हो गई।",
  offline_banner: "ऑफ़लाइन — गेट की कार्रवाइयाँ सेव होकर बाद में सिंक होंगी",
  queued_actions: "कतार में",
  training_on: "ट्रेनिंग मोड — कुछ भी सेव नहीं होगा",
  waiting: "प्रतीक्षा",
  approved: "स्वीकृत",
  auto: "ऑटो",
  sent: "भेज दिया",
  sent_hint: "निवासी को सूचना भेज दी गई है। हरे निशान के लिए गेट टैब देखें।",
  auto_approved: "ऑटो-अप्रूव्ड",
  auto_approved_hint: "इंतज़ार नहीं — गेट टैब पर एंट्री दर्ज करें।",
  queued_title: "ऑफ़लाइन सेव हुआ",
  queued_hint: "नेटवर्क लौटते ही यह अपने आप भेज दिया जाएगा।",
  retry: "फिर कोशिश करें",
  cancel: "रद्द करें",
  camera_needed_title: "कैमरा चाहिए",
  camera_needed_hint: "QR कोड स्कैन करने के लिए कैमरा एक्सेस दें।",
  language: "भाषा",
  training_mode: "ट्रेनिंग मोड",
  training_mode_hint: "गेट के सभी काम अभ्यास करें — कुछ सेव नहीं होगा।",
  check_updates: "ऐप अपडेट जाँचें",
  admin_override: "एडमिन ओवरराइड",
  expired: "समय समाप्त",
};

const dictionaries: Record<Lang, Record<TKey, string>> = { en, hi };

interface PrefsState {
  lang: Lang;
  trainingMode: boolean;
  setLang: (l: Lang) => void;
  setTrainingMode: (on: boolean) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      lang: "en",
      trainingMode: false,
      setLang: (lang) => set({ lang }),
      setTrainingMode: (trainingMode) => set({ trainingMode }),
    }),
    { name: "portl-prefs", storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export function useT() {
  const lang = usePrefs((s) => s.lang);
  return (key: TKey) => dictionaries[lang][key] ?? en[key];
}
