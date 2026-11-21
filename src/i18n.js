// Interface language: English (default) or Czech. Stored in localStorage `nsl-lang`; switching reloads the page (safe with autosave: unsaved work warns first).
// Translation is applied centrally in ui.js (every static text child and placeholder/title/aria-label goes through t()), unknown strings stay English.
let L = 'en';
try { L = localStorage.getItem('nsl-lang') === 'cs' ? 'cs' : 'en'; } catch { /* blocked */ }
try { document.documentElement.lang = L; } catch { /* ignore */ }
export const lang = () => L;
export function setLang(l) { try { localStorage.setItem('nsl-lang', l === 'cs' ? 'cs' : 'en'); } catch { /* blocked */ } location.reload(); }

const CS = {
  // navigation + shell
  'Wall': 'Zeď', 'Paid orders': 'Zaplacené', 'All portraits': 'Všechny', 'No paid portraits yet.': 'Zatím žádné zaplacené portréty.', 'No portraits yet.': 'Zatím žádné portréty.', 'Could not load the wall.': 'Zeď se nepodařilo načíst.', 'Smaller tiles (−)': 'Menší dlaždice (−)', 'Bigger tiles (+)': 'Větší dlaždice (+)', 'Fullscreen (F)': 'Celá obrazovka (F)', 'Could not open the portrait': 'Portrét se nepodařilo otevřít',
  'Overview': 'Přehled', 'Styles': 'Styly', 'Website': 'Web', 'Customers': 'Zákazníci', 'Orders': 'Objednávky', 'Analytics': 'Analytika', 'Growth': 'Růst', 'A/B tests': 'A/B testy', 'System': 'Systém',
  'Search': 'Hledat', 'Search…': 'Hledat…', 'Lock': 'Zamknout', 'Locked.': 'Zamčeno.', 'Language': 'Jazyk', 'Light / dark': 'Světlý / tmavý', 'Switch theme': 'Přepnout vzhled', 'Switch language': 'Přepnout jazyk',
  'Lock console': 'Zamknout konzoli', 'Refresh': 'Obnovit', 'Reload': 'Načíst znovu', 'live': 'živě',
  // common actions
  'Save': 'Uložit', 'Saved': 'Uloženo', 'Cancel': 'Zrušit', 'Close': 'Zavřít', 'Delete': 'Smazat', 'Edit': 'Upravit', 'Create': 'Vytvořit', 'Apply': 'Použít', 'Discard': 'Zahodit', 'Publish': 'Zveřejnit',
  'Move': 'Přesunout', 'Retire': 'Vyřadit', 'Confirm': 'Potvrdit', 'Pause': 'Pozastavit', 'Resume': 'Pokračovat', 'Start': 'Spustit', 'Stop & decide': 'Zastavit a rozhodnout', 'Manage': 'Spravovat',
  'Upload image': 'Nahrát obrázek', 'clear': 'smazat', 'retry': 'znovu', 'more ideas': 'další nápady', 'Download': 'Stáhnout', 'Copy': 'Kopírovat',
  '✓ Saved': '✓ Uloženo', 'Saving': 'Ukládám', 'Editing…': 'Upravuji…', 'Not saved': 'Neuloženo', 'Changed elsewhere': 'Změněno jinde', 'view only': 'jen ke čtení',
  '✓ On website': '✓ Na webu', '↻ Reaching website…': '↻ Dostává se na web…', 'Not on website': 'Není na webu', 'Not public': 'Neveřejné',
  // overview
  'Portraits today': 'Portréty dnes', 'Sessions today': 'Návštěvy dnes', 'Paid items': 'Zaplacené položky', 'Avg generation': 'Průměrná generace',
  'Engine': 'Motor', 'Paid generation': 'Placená generace', 'Queue': 'Fronta', 'Needs review': 'Ke kontrole', 'Submissions': 'Zadání', 'Model': 'Model', 'Style factory': 'Továrna na styly',
  'Live feed': 'Živý přehled', 'Attention': 'Pozornost', 'All clear.': 'Vše v pořádku.', 'Portraits per day · last 14 days': 'Portréty za den · posledních 14 dní', 'today': 'dnes',
  // styles
  'Collections': 'Kolekce', 'AI factory': 'AI továrna', 'New style': 'Nový styl', 'all': 'vše', 'active': 'aktivní', 'review': 'ke kontrole', 'draft': 'koncept', 'hidden': 'skryté', 'retired': 'vyřazené',
  'Smart (status · momentum)': 'Chytře (stav · trend)', 'Trending 7 days': 'Trend 7 dní', 'Most generated': 'Nejvíc generované', 'Best conversion': 'Nejlepší konverze', 'Needs attention': 'Vyžaduje pozornost', 'Newest': 'Nejnovější', 'A → Z': 'A → Z',
  'Settings': 'Nastavení', 'Base Prompt': 'Základní prompt', 'base prompt': 'základní prompt', 'Variants': 'Varianty', 'variants': 'varianty', 'Examples': 'Ukázky', 'examples': 'ukázky', 'Prompt Lab': 'Prompt laboratoř', 'prompt lab': 'prompt laboratoř',
  'Test Lab': 'Testovací laboratoř', 'test lab': 'testovací laboratoř', 'Stats': 'Statistiky', 'stats': 'statistiky', 'settings': 'nastavení',
  'Name': 'Název', 'Collection': 'Kolekce', 'Order': 'Pořadí', 'Tagline': 'Slogan', 'Cover': 'Cover', 'Notes': 'Poznámky', 'AI name': 'AI název', 'Thinking…': 'Přemýšlím…',
  '+ New collection…': '+ Nová kolekce…', 'Use as card image on': 'Použít jako náhled na', 'Publish prompt': 'Zveřejnit prompt', 'Publish changes': 'Zveřejnit změny',
  'New variant': 'Nová varianta', 'Create variant': 'Vytvořit variantu', 'Card image': 'Náhledový obrázek', 'Audience': 'Publikum', 'Prompt': 'Prompt', 'Status': 'Stav',
  'Name needed': 'Chybí název', 'Go live': 'Spustit', 'Show to customers?': 'Ukázat zákazníkům?',
  // collections
  'New collection': 'Nová kolekce', 'Create collection': 'Vytvořit kolekci', 'on web': 'na webu', 'id taken': 'ID je obsazené', 'No styles yet.': 'Zatím žádné styly.', 'Move to…': 'Přesunout do…', '+ Add a style here…': '+ Přidat sem styl…',
  'New collections stay hidden on the website until you switch them on. Open a collection to see its styles and move them in or out.': 'Nové kolekce zůstanou na webu skryté, dokud je nezapneš. Otevři kolekci, uvidíš její styly a můžeš je přesouvat.',
  // website page
  'Intro': 'Úvod', 'Small line above the title': 'Malý řádek nad nadpisem', 'Title': 'Nadpis', 'Intro text': 'Úvodní text', 'Main button': 'Hlavní tlačítko', 'Three steps': 'Tři kroky', 'Step 1': 'Krok 1', 'Step 2': 'Krok 2', 'Step 3': 'Krok 3',
  'Benefits strip': 'Pruh výhod', 'Hero pictures': 'Obrázky v úvodu', 'Royal': 'Královský', 'Couple': 'Pár', 'Family': 'Rodina', 'Pet': 'Mazlíček', 'Western': 'Western', 'Viking': 'Viking', 'As in Shopify': 'Jako v Shopify',
  'Publish to the live website?': 'Zveřejnit na živém webu?', 'Discard unpublished changes?': 'Zahodit nezveřejněné změny?', '● Unpublished changes': '● Nezveřejněné změny',
  // system / generic
  'Loading…': 'Načítám…', 'Offline': 'Offline', 'Sign in': 'Přihlásit se', 'Sign out': 'Odhlásit se', 'Email': 'E-mail', 'Password': 'Heslo', 'Role': 'Role', 'Version': 'Verze',
  'Customer': 'Zákazník', 'Session': 'Návštěva', 'Gens': 'Gen.', 'Fail': 'Chyby', 'Cool': 'Pauzy', 'Generation pauses (cooldowns) so far': 'Dosavadní pauzy generování (cooldown)', 'Cart': 'Košík', 'Score': 'Skóre', 'Hottest leads': 'Nejžhavější zájemci', 'generated': 'vygenerováno', 'carts': 'košíky', 'orders': 'objednávky', 'email': 'e-mail', 'failed': 'selhalo', 'restricted': 'omezené', 'reset': 'reset',
  'Status of the order': 'Stav objednávky', 'No tests yet.': 'Zatím žádné testy.', 'New test': 'Nový test', 'Running': 'Běží', 'Stopped': 'Zastaveno', 'Draft': 'Koncept', 'Paused': 'Pozastaveno',
  'Today': 'Dnes', 'Yesterday': 'Včera', 'Day': 'Den', 'Total': 'Celkem', 'Spend': 'Útrata', 'Clicks': 'Kliky', 'Reach': 'Dosah', 'Revenue': 'Tržby',

  // batch 2: pages, forms, tables
  'A shows (control)': 'A ukazuje (kontrola)', 'B shows (challenger)': 'B ukazuje (vyzyvatel)', 'A wins': 'vyhrává A', 'B wins': 'vyhrává B', 'A/B test': 'A/B test', 'Chance B beats A': 'Šance, že B porazí A', 'chance B beats A': 'šance, že B porazí A', 'keep running': 'nechat běžet',
  'AI may edit': 'AI smí upravit', 'AI style factory': 'AI továrna na styly', 'Action': 'Akce', 'Actor': 'Kdo', 'Ad spend': 'Útrata za reklamy', 'Add': 'Přidat', 'Add variant': 'Přidat variantu',
  'An owner has to enter it.': 'Musí ho zadat vlastník.', 'Apply to live style': 'Použít na živý styl', 'Approve · editor': 'Schválit · editor', 'Audience mix': 'Složení publika', 'Audiences (one variant each)': 'Publika (jedna varianta na publikum)',
  'Audit log': 'Auditní log', 'Auto subject detection': 'Automatické rozpoznání postav', 'Avg': 'Prům.', 'Base prompt (the look)': 'Základní prompt (vzhled)', 'Before you press Start': 'Než zmáčkneš Spustit', 'Bind an authenticator': 'Propojit autentikátor',
  'Blended ROAS (shop)': 'Celkové ROAS (obchod)', 'Budget/day': 'Rozpočet/den', 'Campaigns': 'Kampaně', 'Change daily budget': 'Změnit denní rozpočet', 'Changes made from here': 'Změny provedené odsud', 'Check your inbox': 'Zkontroluj e-mail',
  'Concept / art brief': 'Koncept / zadání', 'Connect Meta Ads': 'Připojit Meta Ads', 'Conversion over time': 'Konverze v čase', 'Copy prompt': 'Kopírovat prompt', 'Copy the prompt': 'Zkopíruj prompt', 'Cost per shop order': 'Cena za objednávku v obchodě',
  'Cover image': 'Úvodní obrázek', 'Create account': 'Vytvořit účet', 'Create draft': 'Vytvořit koncept', 'Daily activity': 'Denní aktivita', 'Decide on': 'Rozhodnout podle', 'Decision note': 'Poznámka k rozhodnutí', 'Detail': 'Detail', 'Discard draft': 'Zahodit koncept', 'Dismiss': 'Zavřít',
  'Edit a layer, then run the test (about 3 minutes).': 'Uprav vrstvu a spusť test (asi 3 minuty).', 'Empty cart.': 'Prázdný košík.', 'Enter the code from your authenticator app.': 'Zadej kód z autentikátoru.', 'Error': 'Chyba', 'Errors': 'Chyby', 'Est. AI spend': 'Odhad útraty za AI',
  'Finance entry': 'Finanční záznam', 'Finance log': 'Finanční log', 'Free with your ChatGPT subscription. Four quick steps:': 'Zdarma s tvým předplatným ChatGPT. Čtyři rychlé kroky:', 'Funnel': 'Trychtýř', 'Guard-rails': 'Pojistky', 'Hide for this session': 'Skrýt pro tuto návštěvu',
  'Hypothesis': 'Hypotéza', 'I confirmed, sign in': 'Potvrdil jsem, přihlásit', 'Item': 'Položka', 'Job': 'Úloha', 'Last': 'Poslední', 'Latency p50 / p90': 'Odezva p50 / p90', 'Lift restriction': 'Zrušit omezení', 'Lock (Ctrl L)': 'Zamknout (Ctrl L)', 'Main': 'Hlavní', 'Members': 'Členové',
  'Meta purchases': 'Nákupy z Meta', 'Name (Czech), e.g. Pro páry': 'Název (česky), např. Pro páry', 'Next': 'Další', 'No Meta data yet.': 'Zatím žádná data z Meta.', 'No campaigns synced yet.': 'Zatím žádné synchronizované kampaně.', 'No entries. Add them under System.': 'Žádné záznamy. Přidej je v Systému.',
  'No failures.': 'Žádné chyby.', 'No generations in range.': 'Žádné generace v období.', 'No match': 'Nic nenalezeno', 'No orders.': 'Žádné objednávky.', 'No portraits yet.': 'Zatím žádné portréty.', 'No sessions match.': 'Žádné návštěvy neodpovídají.',
  'No usable names. Try again.': 'Žádná použitelná jména. Zkus to znovu.', 'Note for the owner (optional)': 'Poznámka pro vlastníka (volitelně)', 'Nothing applied yet.': 'Zatím nic nepoužito.', 'Nothing logged yet.': 'Zatím nic nezaznamenáno.', 'Nothing matches.': 'Nic neodpovídá.',
  'Nothing to change right now.': 'Teď není co měnit.', 'Open ChatGPT': 'Otevřít ChatGPT', 'Open analytics': 'Otevřít analytiku', 'Open session': 'Otevřít návštěvu', 'Orders vs Meta purchases': 'Objednávky vs. nákupy z Meta', 'Paid traffic → order': 'Placená návštěvnost → objednávka',
  'Payment': 'Platba', 'Photo': 'Fotka', 'Portraits': 'Portréty', 'Press Sync to import the last 30 days.': 'Zmáčkni Sync a načte se posledních 30 dní.', 'Previews': 'Náhledy', 'Previous': 'Předchozí', 'Price': 'Cena', 'Production': 'Výroba', 'Prompt layers': 'Vrstvy promptu', 'Provider / model': 'Poskytovatel / model',
  'Publish review': 'Zveřejnit po kontrole', 'Qty': 'Ks', 'Recent failures': 'Poslední chyby', 'Recent tests': 'Poslední testy', 'Reference image URLs': 'URL referenčních obrázků', 'Refreshes every 10 s': 'Obnovuje se každých 10 s', 'Refreshes every 20 s while this tab is open': 'Obnovuje se každých 20 s, dokud je karta otevřená',
  'Regenerate in ChatGPT': 'Vygenerovat znovu v ChatGPT', 'Regenerate with AI (paid)': 'Vygenerovat znovu přes AI (placené)', 'Remove': 'Odebrat', 'Request access': 'Požádat o přístup', 'Request sent': 'Žádost odeslána', 'Reset session': 'Resetovat návštěvu', 'Restore': 'Obnovit', 'Restrict': 'Omezit',
  'Save the image ChatGPT makes.': 'Ulož obrázek, který ChatGPT vytvoří.', 'Second factor': 'Druhý faktor', 'Seen': 'Viděno', 'Send the style reference image with the photos': 'Poslat referenční obrázek stylu spolu s fotkami', 'Sessions': 'Návštěvy', 'Size': 'Velikost', 'Sort': 'Řazení', 'Spec': 'Specifikace',
  'Spend per day': 'Útrata za den', 'Starts as': 'Začíná jako', 'Stop test': 'Zastavit test', 'Stop test and record the decision': 'Zastavit test a zapsat rozhodnutí', 'Style': 'Styl', 'Style factory runs': 'Běhy továrny na styly', 'Style leaderboard': 'Žebříček stylů', 'Style name (Czech)': 'Název stylu (česky)',
  'Style reference': 'Referenční styl', 'Subj.': 'Postav', 'Subjects per portrait': 'Postav na portrét', 'Submission cap': 'Limit zadání', 'Suggestions': 'Návrhy', 'Sync': 'Synchronizovat', 'Target': 'Cíl', 'Test result': 'Výsledek testu', 'The 3 hard photos': '3 těžké fotky', 'The trend appears after the second day.': 'Trend se ukáže po druhém dni.',
  'Time': 'Čas', 'Toggle generation': 'Přepnout generaci', 'Type': 'Typ', 'Type a command, style, or session…  (↑↓ ⏎)': 'Napiš příkaz, styl nebo návštěvu…  (↑↓ ⏎)', 'Undo apply': 'Vrátit použití', 'Upload': 'Nahrát', 'Variant': 'Varianta', 'Visit → portrait': 'Návštěva → portrét',
  'We sent a confirmation link to': 'Poslali jsme potvrzovací odkaz na', 'When': 'Kdy', 'When people create': 'Kdy lidé tvoří', 'activity by weekday and hour': 'aktivita podle dne a hodiny', 'ad account id': 'ID reklamního účtu', 'applied': 'použito', 'cart': 'košík', 'computing…': 'počítám…',
  'copy': 'kopírovat', 'cumulative conversion by day': 'kumulativní konverze po dnech', 'current hero': 'současný úvod', 'delete empty collection': 'smazat prázdnou kolekci', 'discard draft': 'zahodit koncept', 'editor · styles & labels': 'editor · styly a štítky', 'email to allow': 'e-mail ke schválení',
  'generation': 'generace', 'hide': 'skrýt', 'loading': 'načítám', 'manual key:': 'ruční klíč:', 'max subjects': 'max. postav', 'mfa not set': 'MFA není nastaveno', 'new headline + photo': 'nový nadpis + fotka', 'next →': 'další →', 'no photo yet': 'zatím bez fotky',
  'none': 'žádné', 'not described': 'bez popisu', 'not set': 'nenastaveno', 'one gallery for every variant': 'jedna galerie pro všechny varianty', 'optional · up to 3 · public https': 'volitelné · až 3 · veřejné https', 'or drop a file · resized to WebP': 'nebo přetáhni soubor · zmenší se na WebP',
  'order': 'objednávka', 'owner applies': 'použije vlastník', 'owner · everything': 'vlastník · vše', 'people/pets': 'lidé/mazlíčci', 'portraits': 'portréty', 'private': 'soukromé', 'ref': 'ref.', 'remove': 'odebrat', 'reset to live': 'vrátit na živou verzi', 'reverted': 'vráceno', 'search ref, label, email, id…': 'hledej ref., štítek, e-mail, id…',
  'search styles & variants…': 'hledej styly a varianty…', 'secure': 'zabezpečeno', 'shop orders': 'objednávky v obchodě', 'style reference image': 'referenční obrázek stylu', 'taken': 'obsazeno', 'trend': 'trend', 'undo AI edit': 'vrátit úpravu AI', 'uploaded': 'nahráno', 'uploads': 'nahrávky',
  'used for the spend estimate': 'použito pro odhad útraty', 'uses base prompt': 'používá základní prompt', 'uses style base': 'používá základ stylu', 'viewer': 'čtenář', 'viewer · read only': 'čtenář · jen čtení', 'what you expect and why': 'co čekáš a proč', 'what you learned': 'co ses naučil',
  'Internal group name. Customers see the variant names:': 'Interní název skupiny. Zákazníci vidí názvy variant:', 'Rename them': 'Přejmenovat',
  // batch 3: scan leftovers
  '(hidden on web)': '(skryté na webu)', 'The website shows each variant\'s card image, so this puts the cover there.': 'Web ukazuje náhledový obrázek každé varianty, tohle tam cover nastaví.', 'gens': 'gen.', 'fix': 'chyb', 'Last active': 'Naposledy aktivní', 'Cart / order value': 'Hodnota košíku / objednávky',
  'Most portraits': 'Nejvíc portrétů', 'Most failures': 'Nejvíc chyb', 'item': 'položka', 'page': 'strana', 'visitors': 'návštěvníci', 'Visitors': 'Návštěvníci', 'running': 'běží', 'stopped': 'zastaveno', 'Got a portrait': 'Vytvořil portrét', 'got a portrait': 'vytvořil portrét',
  'control': 'kontrola', 'challenger': 'vyzyvatel', 'leading': 'vede', 'Creator': 'Tvorba', 'Portrait': 'Portrét', 'nothing published yet, the site uses Shopify’s own texts': 'zatím nic zveřejněno, web používá texty ze Shopify',
  'Empty field = Shopify’s original.': 'Prázdné pole = originál ze Shopify.', 'Live': 'Živě', 'published': 'zveřejněno',
  // cooldown analytics (cooldown.js)
  'Cooldown': 'Pauza generování', 'Sessions on policy v2': 'Návštěvy na pravidlech v2', 'Sessions with a cooldown': 'Návštěvy s pauzou', 'Cooldowns started': 'Spuštěné pauzy', 'Cooling down now': 'Právě v pauze',
  'Incidence': 'Výskyt', 'Generating sessions': 'Návštěvy, které generují', 'Hit a cooldown': 'Narazily na pauzu', 'First cooldowns': 'První pauzy', 'Repeat cooldowns': 'Opakované pauzy',
  'After the cooldown': 'Po pauze', 'Cart and payment after a cooldown': 'Košík a platba po pauze', 'Cooled vs not cooled': 'S pauzou vs. bez pauzy', 'Cooldown notice seen': 'Zobrazené upozornění na pauzu', 'Email gate': 'E-mailová brána',
  'Generation pause': 'Pauza generování', 'not cooling down': 'bez pauzy', 'Cooling down right now': 'Právě v pauze', 'By A/B arm': 'Podle varianty A/B', 'Added to cart': 'Přidáno do košíku',
  // customer-journey analytics (Analytics tabs, cx.js)
  'Customer journey': 'Cesta zákazníka', 'Friction': 'Třecí body', 'Optimise': 'Optimalizace', 'All devices': 'Všechna zařízení', 'Phone': 'Telefon', 'Computer': 'Počítač',
  'Tracked visitors': 'Sledovaní návštěvníci', 'Visitor → portrait': 'Návštěvník → portrét', 'Visitor → paid': 'Návštěvník → zaplatil', 'Time to first Create press': 'Čas do prvního „Vytvořit“',
  'Visited the site': 'Navštívil web', 'Opened the creator': 'Otevřel tvůrce', 'Added a photo': 'Přidal fotku', 'Pressed "Create"': 'Stiskl „Vytvořit“', 'Got a portrait': 'Dostal portrét',
  'Opened size & price': 'Otevřel velikost a cenu', 'Picked a size': 'Vybral velikost', 'Added to cart': 'Přidal do košíku', 'Went to checkout': 'Šel k platbě', 'Paid': 'Zaplatil',
  'Landing page': 'Úvodní stránka', 'Saw the home page': 'Viděl úvodní stránku', 'Scrolled past 50 %': 'Doscrolloval za 50 %', 'Clicked a "create" button': 'Klikl na tlačítko „Vytvořit“',
  'Data quality': 'Kvalita dat', 'By device': 'Podle zařízení', 'By traffic source': 'Podle zdroje návštěvy', 'By landing page': 'Podle vstupní stránky', 'By campaign (utm_campaign)': 'Podle kampaně (utm_campaign)',
  'Visitors': 'Návštěvníci', 'Opened creator': 'Otevřeli tvůrce', 'Cart': 'Košík', 'Home page sections': 'Sekce úvodní stránky', 'Section': 'Sekce', 'Reached': 'Dosáhlo', 'Avg seconds': 'Prům. sekundy', 'Clicks': 'Kliky',
  'Visitors per day': 'Návštěvníci za den', 'Customer journey ': 'Cesta zákazníka', 'Friction hot-spots': 'Místa, kde to drhne', 'Errors people saw': 'Chyby, které lidé viděli', 'Page speed and attention': 'Rychlost a pozornost stránek',
  'What people click': 'Na co lidé klikají', 'Creator steps': 'Kroky tvůrce', 'Heatmaps and recordings': 'Teplotní mapy a nahrávky', 'Open Clarity': 'Otevřít Clarity', 'Visitors with friction': 'Návštěvníci s třením',
  'Visitors who saw an error': 'Návštěvníci, kteří viděli chybu', 'Portrait wait (median)': 'Čekání na portrét (medián)', 'Checkout clicks': 'Kliky na platbu', 'Signal': 'Signál', 'Element': 'Prvek', 'Page': 'Stránka', 'Times': 'Kolikrát', 'Last': 'Naposledy',
  'What to fix or test next': 'Co opravit nebo testovat dál', 'Test planner': 'Plánovač testu', 'How to use this': 'Jak to používat', 'Copy as test idea': 'Zkopírovat jako nápad na test', 'Critical': 'Kritické', 'Important': 'Důležité', 'Nice to have': 'Až bude čas',
  'Goal': 'Cíl', 'Current rate': 'Současná míra', 'Visitors needed per variant': 'Potřebných návštěvníků na variantu', 'Behaviour per variant': 'Chování podle varianty', 'Saw the page': 'Viděl stránku', 'Saw an error': 'Viděl chybu',
  'Scrolled past 50 %': 'Doscrolloval za 50 %', 'Phone share': 'Podíl telefonů', 'Average active time': 'Průměrná aktivní doba',
  'Est. AI spend': 'Odhad nákladů na AI', 'Real AI bill so far (USD)': 'Skutečná faktura za AI zatím (USD)', 'Calibrate': 'Zkalibrovat', 'USD → Kč': 'USD → Kč',
  // A/B tests v2, finance, top bars, clear cart (1.12.0)
  'Change one thing, let half the visitors see it, and see which version brings more paid orders.': 'Změňte jednu věc, polovině návštěvníků ji ukažte a uvidíte, která verze přinese víc zaplacených objednávek.',
  'New test': 'Nový test', 'No test is running.': 'Neběží žádný test.', 'Start your first test': 'Spustit první test', 'Start test': 'Spustit test', 'Starting…': 'Spouštím…',
  'Pick what to change (a headline, a button text, hide a section), press Start. Takes under a minute and needs no website editing.': 'Vyberte, co změnit (nadpis, text tlačítka, skrytí sekce) a stiskněte Spustit. Zabere to minutu a nemusíte nic upravovat na webu.',
  '1 · What do you want to test?': '1 · Co chcete testovat?', 'Headline': 'Nadpis', 'Main heading at the top of the home page': 'Hlavní nadpis nahoře na úvodní stránce', 'Intro text': 'Úvodní text', 'Paragraph under the headline': 'Odstavec pod nadpisem',
  'Button text': 'Text tlačítka', 'The orange "Vytvořit portrét zdarma" buttons': 'Oranžová tlačítka „Vytvořit portrét zdarma“', 'Line under the button': 'Řádek pod tlačítkem', 'Hide a section': 'Skrýt sekci', 'Does the page convert better without it?': 'Prodává stránka lépe bez ní?',
  'Something else': 'Něco jiného', 'Any element (CSS selector) on any page': 'Libovolný prvek (CSS selektor) na libovolné stránce', 'All pages': 'Všechny stránky', 'Home': 'Úvod', 'Creator': 'Tvůrce', 'Product': 'Produkt', 'Cart': 'Košík',
  '2 · Which section should B visitors not see?': '2 · Kterou sekci nemá vidět varianta B?', '2 · What should B visitors read instead?': '2 · Co mají místo toho číst návštěvníci varianty B?', 'Advanced': 'Pokročilé',
  'Name': 'Název', 'Measure': 'Měřit', 'Share of visitors who see B:': 'Podíl návštěvníků, kteří vidí B:', 'Conversion goal for the top bar (%)': 'Cíl konverze pro horní lištu (%)',
  'End test…': 'Ukončit test…', 'End test': 'Ukončit test', 'Pause': 'Pozastavit', 'Resume': 'Pokračovat', 'Use B for everyone': 'Použít B pro všechny', 'Keep the original (A)': 'Ponechat původní (A)', 'No clear winner': 'Bez jasného vítěze',
  'Keep running': 'Nechte běžet', 'B is winning': 'B vyhrává', 'The original (A) is better': 'Původní (A) je lepší', 'No clear difference yet': 'Zatím žádný zřetelný rozdíl', 'Collecting the first visitors': 'Sbírám první návštěvníky',
  'Conversion over time': 'Konverze v čase', 'All tests': 'Všechny testy', 'Other tests': 'Další testy', 'Past tests': 'Minulé testy', 'Switch B off': 'Vypnout B', 'Switch B on': 'Zapnout B', 'Preview A': 'Náhled A', 'Preview B': 'Náhled B',
  'Test': 'Test', 'Result': 'Výsledek', 'Visitors': 'Návštěvníci',
  'Clear cart': 'Vyprázdnit košík', 'Clear this cart?': 'Vyprázdnit tento košík?',
  'Finance': 'Finance', 'Profit': 'Zisk', 'Conversion': 'Konverze', 'Revenue (paid orders)': 'Tržby (zaplacené objednávky)', 'Printing + delivery': 'Tisk + doprava', 'AI generations': 'AI generování', 'Ads': 'Reklama', 'Other costs': 'Ostatní náklady',
  'Last days': 'Poslední dny', 'Ads per day': 'Reklama na den', 'Daily ad spend (Kč)': 'Denní výdaj na reklamu (Kč)', 'Counted from': 'Počítat od', 'Different amount for one day': 'Jiná částka pro jeden den', 'Ads that day (Kč)': 'Reklama ten den (Kč)',
  'Other costs that day (Kč)': 'Ostatní náklady ten den (Kč)', 'Save day': 'Uložit den', 'Save settings': 'Uložit nastavení', 'Delivery per order (Kč)': 'Doprava na objednávku (Kč)', 'Customer pays (Kč)': 'Zákazník platí (Kč)', 'Print cost (Kč)': 'Cena tisku (Kč)',
  'Prices and print costs': 'Ceny a náklady na tisk', 'Day': 'Den', 'Orders': 'Objednávky', 'Revenue': 'Tržby', 'Print': 'Tisk', 'AI': 'AI',
};
export const t = s => {
  if (L !== 'cs' || typeof s !== 'string') return s;
  const k = s.trim(); if (!k) return s;
  const v = CS[k]; return v ? s.replace(k, v) : s;
};
