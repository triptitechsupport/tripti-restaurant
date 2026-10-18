// Text and fixed content for the homepage. Dishes, prices, categories and the
// weekly closing day come from the admin (PocketBase); this file only holds
// wording and explanations that don't change with the menu.

// Lunch and dinner service, in minutes after midnight (Vienna time).
// Same hours as the footer, contact page and reservation slots.
export const SERVICE = [[11 * 60, 13 * 60], [17 * 60, 21 * 60]];
export const PHONE = '+43 664 1219289';
export const PHONE_TEL = '+436641219289';

export const T = {
  de: {
    sound: 'Klang',
    'cta.reserve': 'Tisch reservieren',
    'cta.menu': 'Speisekarte öffnen',
    'cta.order': 'Online bestellen',
    'hero.welcome': 'Willkommen auf unserer Reise zu authentischen Geschmackserlebnissen!',
    'hero.tag': 'Das authentische indische Restaurant',
    'hero.eyebrow': 'Das authentische indische Restaurant · Villach',
    'hero.title1': 'Der Geschmack Südindiens, ',
    'hero.title2': 'mitten in Villach.',
    'hero.lead': 'Knusprige Dosas und luftige Idlis, Dum-Biryani nach Hyderabadi-Art, Currys aus Kerala und Klassiker aus dem Norden. Frisch gekocht in der Italiener Straße 17.',
    'hero.hint': 'Tipp: Schalten Sie den Klang ein und tippen Sie auf die Öllampen.',
    'f.hours': 'Öffnungszeiten', 'f.hoursV': '11–13 & 17–21 Uhr', 'f.rest': 'Ruhetag', 'f.phone': 'Telefon',
    'sig.eyebrow': 'Aus unserer Küche', 'sig.title': "Tripti's Klassiker",
    'sig.lead': 'Gerichte, die zeigen, wofür wir stehen. Tippen Sie auf ein Gericht, um es in der Speisekarte zu finden.',
    'menu.eyebrow': 'Speisekarte · Menu', 'menu.title': 'Unsere Speisekarte', 'menu.search': 'Gericht suchen, z. B. Dosa',
    'menu.all': 'Alle', 'menu.veg': 'Vegetarisch', 'menu.nv': 'Mit Fleisch',
    'menu.allergens': 'Allergene (Kennzeichnung nach österreichischem Lebensmittelrecht)', 'menu.note': 'Preise in Euro inkl. MwSt.',
    'menu.empty': 'Keine passenden Gerichte gefunden.', 'menu.results': 'Suchergebnisse', 'menu.found': '{n} Gerichte gefunden',
    'menu.loading': 'Speisekarte wird geladen …', 'menu.full': 'Speisekarte als Liste', 'menu.book': 'Speisekarte aufschlagen',
    veg: 'Vegetarisch', nv: 'Mit Fleisch',
    add: '+ In den Warenkorb', added: '✓ Im Warenkorb', 'toast.added': '{n} im Warenkorb',
    'ex.label': 'Ohne:', 'ex.note': 'Bei schweren Allergien fragen Sie bitte zusätzlich unser Personal.',
    'tif.eyebrow': 'Was ist auf dem Teller?', 'tif.title': 'Ein südindisches Tiffin',
    'tif.lead': 'So frühstückt man in Südindien – und bei uns gibt es das den ganzen Tag. Tippen Sie auf die Punkte.',
    'story.eyebrow': 'Über uns', 'story.quote1': '„Tripti“ bedeutet ', 'story.quote2': 'Zufriedenheit', 'story.quote3': '. So sollen Sie unser Restaurant verlassen.',
    'story.p1': 'Unsere Karte reicht von den Tiffin-Klassikern Andhra Pradeshs über die Biryanis Hyderabads und die Kokos-Currys Keralas bis zu den Tandoor-Gerichten des Nordens. Chutneys, Sambar und Gewürzmischungen bereiten wir selbst zu.',
    'story.p2': 'Neu in der indischen Küche? Fragen Sie uns. Wir erklären jedes Gericht und passen die Schärfe gern an.',
    'story.nAll': 'Gerichte', 'story.nVeg': 'davon vegetarisch', 'story.nCat': 'Kategorien', 'gloss.title': 'Kleines Küchen-ABC',
    'res.eyebrow': 'Reservierung', 'res.title': 'Tisch reservieren',
    'res.lead': 'Wählen Sie Tag, Uhrzeit und Personen. Ihre Anfrage kommt direkt bei uns an.',
    'res.go': 'Zur Reservierung', 'res.formT': 'Online reservieren',
    'res.formP': 'Freie Tage und Uhrzeiten sehen Sie direkt im Formular. Ruhetage und Betriebsurlaub sind dort schon gesperrt.',
    'res.callT': 'Lieber anrufen?', 'res.callP': 'Während der Öffnungszeiten erreichen Sie uns direkt.', 'res.copy': 'Kopieren', 'res.copied': 'Kopiert',
    'res.groupT': 'Gruppen & Feiern', 'res.groupP': 'Ab 8 Personen stellen wir gern ein Thali- oder Biryani-Menü für Ihren Tisch zusammen.',
    'visit.eyebrow': 'Besuchen Sie uns', 'visit.title': 'Mitten in Villach', 'visit.hours': 'Öffnungszeiten', 'visit.where': 'So finden Sie uns',
    'visit.route': 'Route planen', 'visit.review': 'Auf Google bewerten', 'visit.contact': 'Kontakt',
    'closing.title': 'Authentischer Geschmack. Zeitlose Tradition.', 'closing.sub': 'Authentic taste. Timeless tradition.',
    'closing.thanks': 'Vielen Dank! Kommen Sie gerne wieder',
    'bar.call': 'Anrufen', 'bar.res': 'Reservieren', 'bar.menu': 'Speisekarte',
    'st.open': 'Jetzt geöffnet · bis {t} Uhr', 'st.later': 'Heute ab {t} Uhr geöffnet', 'st.break': 'Mittagspause · wieder ab {t} Uhr',
    'st.closed': 'Geschlossen · wieder {d} ab {t} Uhr', 'st.tom': 'morgen', 'st.in': 'in {d}', 'st.holiday': 'Heute geschlossen',
    closed: 'Ruhetag', 'toast.on': 'Klang an – tippen Sie auf die Öllampen', 'toast.off': 'Klang aus', lamp: 'Glocke läuten',
    days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  },
  en: {
    sound: 'Sound',
    'cta.reserve': 'Book a table',
    'cta.menu': 'Open the menu',
    'cta.order': 'Order online',
    'hero.welcome': 'Welcome to our authentic taste journey!',
    'hero.tag': 'The authentic Indian restaurant',
    'hero.eyebrow': 'The authentic Indian restaurant · Villach',
    'hero.title1': 'The taste of South India, ',
    'hero.title2': 'in the heart of Villach.',
    'hero.lead': 'Crisp dosas and fluffy idlis, Hyderabadi dum biryani, Kerala curries and northern classics. Cooked fresh at Italiener Straße 17.',
    'hero.hint': 'Tip: turn on the sound and tap the oil lamps.',
    'f.hours': 'Opening hours', 'f.hoursV': '11 am–1 pm & 5–9 pm', 'f.rest': 'Closed on', 'f.phone': 'Phone',
    'sig.eyebrow': 'From our kitchen', 'sig.title': "Tripti's classics",
    'sig.lead': 'Dishes that show what we are about. Tap a dish to find it in the menu.',
    'menu.eyebrow': 'Menu · Speisekarte', 'menu.title': 'Our menu', 'menu.search': 'Search dishes, e.g. dosa',
    'menu.all': 'All', 'menu.veg': 'Vegetarian', 'menu.nv': 'Meat',
    'menu.allergens': 'Allergens (Austrian labelling codes)', 'menu.note': 'Prices in euro incl. VAT.',
    'menu.empty': 'No matching dishes.', 'menu.results': 'Search results', 'menu.found': '{n} dishes found',
    'menu.loading': 'Loading the menu …', 'menu.full': 'Menu as a list', 'menu.book': 'Open the menu book',
    veg: 'Vegetarian', nv: 'Meat',
    add: '+ Add to cart', added: '✓ In cart', 'toast.added': '{n} added to cart',
    'ex.label': 'Without:', 'ex.note': 'If you have a severe allergy, please also ask our staff.',
    'tif.eyebrow': "What's on the plate?", 'tif.title': 'A South Indian tiffin',
    'tif.lead': 'This is breakfast in South India, and we serve it all day. Tap the dots.',
    'story.eyebrow': 'About us', 'story.quote1': '“Tripti” means ', 'story.quote2': 'contentment', 'story.quote3': '. That is how we want you to leave.',
    'story.p1': 'Our menu runs from the tiffin classics of Andhra Pradesh to the biryanis of Hyderabad, the coconut curries of Kerala and the tandoor dishes of the north. We make our chutneys, sambar and spice blends ourselves.',
    'story.p2': 'New to Indian food? Just ask. We explain every dish and happily adjust the spice.',
    'story.nAll': 'dishes', 'story.nVeg': 'of them vegetarian', 'story.nCat': 'categories', 'gloss.title': 'A short kitchen glossary',
    'res.eyebrow': 'Reservations', 'res.title': 'Book a table',
    'res.lead': 'Choose a day, time and party size. Your request comes straight to us.',
    'res.go': 'Go to booking', 'res.formT': 'Book online',
    'res.formP': 'The form shows which days and times are free. Closing days and holidays are already blocked.',
    'res.callT': 'Prefer to call?', 'res.callP': 'Reach us directly during opening hours.', 'res.copy': 'Copy', 'res.copied': 'Copied',
    'res.groupT': 'Groups & celebrations', 'res.groupP': 'For 8 or more guests we can put together a thali or biryani menu for your table.',
    'visit.eyebrow': 'Visit us', 'visit.title': 'In the heart of Villach', 'visit.hours': 'Opening hours', 'visit.where': 'How to find us',
    'visit.route': 'Get directions', 'visit.review': 'Review us on Google', 'visit.contact': 'Contact',
    'closing.title': 'Authentic taste. Timeless tradition.', 'closing.sub': 'Authentischer Geschmack. Zeitlose Tradition.',
    'closing.thanks': 'Thank you! Visit again',
    'bar.call': 'Call', 'bar.res': 'Book', 'bar.menu': 'Menu',
    'st.open': 'Open now · until {t}', 'st.later': 'Opens today at {t}', 'st.break': 'Lunch break · back at {t}',
    'st.closed': 'Closed · opens {d} at {t}', 'st.tom': 'tomorrow', 'st.in': 'in {d}', 'st.holiday': 'Closed today',
    closed: 'Closed', 'toast.on': 'Sound on – tap the oil lamps', 'toast.off': 'Sound off', lamp: 'Ring the bell',
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
};

// Allergen codes as used in Admin > Menu Management.
export const ALG = {
  A: ['Gluten', 'Gluten'], B: ['Krebstiere', 'Crustaceans'], C: ['Ei', 'Egg'], D: ['Fisch', 'Fish'],
  E: ['Erdnuss', 'Peanuts'], F: ['Soja', 'Soy'], G: ['Milch / Laktose', 'Milk / lactose'], H: ['Schalenfrüchte (Nüsse)', 'Tree nuts'],
  L: ['Sellerie', 'Celery'], M: ['Senf', 'Mustard'], N: ['Sesam', 'Sesame'], O: ['Sulfite', 'Sulphites'],
  P: ['Lupinen', 'Lupin'], R: ['Weichtiere', 'Molluscs'],
};
// Allergens offered as quick "without" filters.
export const EXCLUDABLE = ['A', 'G', 'H', 'E', 'M'];

// Signature dishes: matched by name against the live menu. A dish that isn't
// on the menu any more is skipped; the row is filled from other dishes.
export const SIGNATURES = [
  { match: ['dum biryani', 'biryani'], region: 'Hyderabad' },
  { match: ['masala dosa', 'dosa'], region: 'Andhra' },
  { match: ['idiyappam', 'marag', 'stew'], region: 'Kerala' },
  { match: ['malabar'], region: 'Malabar' },
  { match: ['punugulu', 'teigbällchen'], region: 'Andhra' },
  { match: ['thali'], region: 'Thali' },
];

export const GLOSS = [
  ['Dosa', 'Hauchdünner, knuspriger Crêpe aus fermentiertem Reis- und Linsenteig.', 'Thin, crisp crêpe of fermented rice and lentil batter.'],
  ['Idli', 'Weiche, gedämpfte Küchlein aus demselben Teig.', 'Soft steamed cakes made from the same batter.'],
  ['Vada', 'Frittierter Linsenkringel, außen knusprig, innen fluffig.', 'Fried lentil doughnut, crisp outside and fluffy inside.'],
  ['Sambar', 'Linseneintopf mit Gemüse und Tamarinde – gehört zu fast allem.', 'Lentil stew with vegetables and tamarind. Goes with almost everything.'],
  ['Idiyappam', 'Gedämpfte Nester aus feinen Reisnudeln, ideal zu Stews.', 'Steamed nests of fine rice noodles, perfect with stews.'],
  ['Dum', 'Der Topf wird versiegelt und langsam gegart, damit das Aroma bleibt.', 'The pot is sealed and cooked slowly to keep the aroma in.'],
  ['Tadka', 'Gewürze kurz in heißem Öl angebraten und über das Gericht gegeben.', 'Spices briefly fried in hot oil and poured over the dish.'],
];

// Hotspots on the tiffin plate photo: position in %, the text shown, and
// names to find the dish on the live menu (for its price).
export const SPOTS = [
  { x: 19, y: 40, de: ['Sambar', 'Linseneintopf aus Toor Dal, Gemüse und Tamarinde.'], en: ['Sambar', 'Lentil stew of toor dal, mixed vegetables and tamarind.'], match: ['sambar'] },
  { x: 33, y: 18, de: ['Tomaten-Chutney', 'Reife Tomaten, Zwiebeln, rote Chili und Tamarinde.'], en: ['Tomato chutney', 'Ripe tomatoes, onion, dried red chilli and tamarind.'], match: ['tomato chutney', 'tomaten-chutney'] },
  { x: 51, y: 10, de: ['Kokos-Chutney', 'Frische Kokosnuss, geröstetes Chana Dal, grüne Chili und Ingwer.'], en: ['Coconut chutney', 'Fresh coconut, roasted chana dal, green chilli and ginger.'], match: ['coconut chutney', 'kokos-chutney'] },
  { x: 69, y: 19, de: ['Erdnuss-Chutney', 'Geröstete Erdnüsse, grüne Chili, Ingwer und Tamarinde.'], en: ['Peanut chutney', 'Roasted peanuts, green chilli, ginger and tamarind.'], match: ['peanut chutney', 'erdnuss-chutney'] },
  { x: 45, y: 40, de: ['Idli', 'Gedämpfte, luftige Küchlein aus Reis- und Linsenteig.'], en: ['Idli', 'Soft, fluffy steamed rice and urad dal cakes.'], match: ['idli'] },
  { x: 70, y: 52, de: ['Masala Dosa', 'Knuspriger Reis-Linsen-Crêpe mit gewürzten Kartoffeln.'], en: ['Masala dosa', 'Crisp rice and lentil crêpe filled with spiced potato.'], match: ['masala dosa'] },
  { x: 28, y: 65, de: ['Masala Vada', 'Knusprige Linsenbratlinge aus Chana Dal und Kräutern.'], en: ['Masala vada', 'Crisp lentil fritters of chana dal and herbs.'], match: ['masala vada'] },
  { x: 71, y: 79, de: ['Garelu (Medu Vada)', 'Knusprige Linsenringe aus Urad Dal, Ingwer und Curryblättern.'], en: ['Garelu (medu vada)', 'Crisp lentil rings of urad dal, ginger and curry leaves.'], match: ['garelu', 'medu vada', 'uzhunnu', 'linsenringe'] },
];
