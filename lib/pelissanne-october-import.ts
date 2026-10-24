import { readActiveCenterId } from "@/lib/center-access";
import { createCrmLead, loadCrmLeads } from "@/lib/crm-supabase";
import { normalizeLeadStatus } from "@/lib/lead-statuses";

export const PELISSANNE_CENTER_ID = "8a06cf41-27cc-4acc-9f40-1672b801cc77";

type RawRow = {
  at: string;
  name: string;
  phone: string;
  email: string;
  zones?: string;
  status: string;
  extra?: string;
  note?: string;
  campaign: "prospect minceur" | "prospect visage";
};

const MINCEUR: RawRow[] = [
  { at: "2026-10-01T15:27:06", name: "Henaff Christine", phone: "684935265", email: "christinehenaff@hotmail.fr", status: "Souhaite être rappelé(e) plus trad", campaign: "prospect minceur" },
  { at: "2026-10-01T22:41:26", name: "porret Delphine", phone: "33689394149", email: "delphine.porret@gmail.com", status: "Reviendra vers nous", campaign: "prospect minceur" },
  { at: "2026-10-02T14:24:56", name: "Granger Adelyne", phone: "33627261221", email: "adelyne.granger@gmail.com", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-02T22:14:53", name: "Maillard Virginie", phone: "33620788248", email: "maillardvi@orange.fr", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-02T23:11:57", name: "Brusco Caroline", phone: "33672049336", email: "carolinedelannoy@sfr.fr", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-03T09:36:18", name: "Cuenca Anais", phone: "33617737576", email: "acerniac19@gmail.com", status: "RDV PRIS", extra: "vendu ok", campaign: "prospect minceur" },
  { at: "2026-10-04T16:54:15", name: "Chambon Laura", phone: "33778711722", email: "laura-13140@live.fr", status: "Reviendra vers nous", campaign: "prospect minceur" },
  { at: "2026-10-04T17:45:18", name: "Ballasse Emmanuelle", phone: "33683206147", email: "emmanuelle.ballasse@gmail.com", status: "À relancer, RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-05T09:06:19", name: "LETERC Véronique", phone: "33620304511", email: "veroleterc@orange.fr", status: "PI", campaign: "prospect minceur" },
  { at: "2026-10-05T20:45:40", name: "Ballasse Emmanuelle", phone: "33683206147", email: "emmanuelle.ballasse@gmail.com", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-06T23:25:43", name: "Boutaibi Nora", phone: "33771136667", email: "messainora6@gmail.com", status: "Reviendra vers nous", campaign: "prospect minceur" },
  { at: "2026-10-07T21:01:57", name: "Dufay Sylvie", phone: "33642252690", email: "sylviedufay@live.fr", status: "À relancer", note: "3", campaign: "prospect minceur" },
  { at: "2026-10-07T21:11:46", name: "pintegne magalie", phone: "33785724597", email: "maga13580@outlook.fr", status: "À relancer", note: "3", campaign: "prospect minceur" },
  { at: "2026-10-07T21:12:38", name: "Burggreaeve Magalie", phone: "33782724597", email: "maga13580@outlook.fr", status: "Doublon", campaign: "prospect minceur" },
  { at: "2026-10-07T23:53:58", name: "Coulanhe Sandrine", phone: "33763051663", email: "sandrinecoulange14@gmail.com", status: "À relancer", note: "5", campaign: "prospect minceur" },
  { at: "2026-10-09T21:41:07", name: "Guntzburger Corinne", phone: "33778517858", email: "co.guntz@outlook.fr", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-10T07:24:17", name: "Chouitah Malika", phone: "33782608183", email: "malika.chouitah19@gmail.com", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-10T18:16:03", name: "Combin Martine", phone: "33613254532", email: "martinec66@yahoo.com", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-10T19:23:41", name: "Boutaibi Nora", phone: "33771136667", email: "messainora6@gmail.com", status: "À relancer", note: "4", campaign: "prospect minceur" },
  { at: "2026-10-11T00:33:49", name: "Verdillan Marine", phone: "33761602910", email: "mynaanl29@gmail.com", status: "À relancer", note: "3", campaign: "prospect minceur" },
  { at: "2026-10-11T08:58:42", name: "Cortes Christelle", phone: "33784643018", email: "corteschristelle34@gmail.com", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-12T03:04:58", name: "Caldarella Tony", phone: "33759967508", email: "lounys477@gmail.com", status: "À relancer", note: "5", campaign: "prospect minceur" },
  { at: "2026-10-12T08:33:00", name: "Sandrine Rocca", phone: "33684963778", email: "sandrine.rocca@icloud.com", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-12T14:14:00", name: "Philippe bourdon", phone: "33685665287", email: "bennhy@orange.fr", status: "PI", campaign: "prospect minceur" },
  { at: "2026-10-12T15:03:00", name: "Nelly Garino", phone: "33682499857", email: "garinell@gmail.com", status: "À relancer", campaign: "prospect minceur" },
  { at: "2026-10-12T17:29:00", name: "Nadege Bouchet", phone: "33650696435", email: "swanlina1217@gmail.com", status: "À relancer", campaign: "prospect minceur" },
  { at: "2026-10-12T21:51:29", name: "Gayet Sandrine", phone: "33630727537", email: "sandrine.2204", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-15T16:15:54", name: "Giacalone Christiane", phone: "33612850633", email: "chris.giaca@yahoo.fr", status: "À relancer", campaign: "prospect minceur" },
  { at: "2026-10-15T22:16:40", name: "Seka Cyndy", phone: "33601338023", email: "etchipaule@gmail.com", status: "À relancer", campaign: "prospect minceur" },
  { at: "2026-10-17T16:51:55", name: "Cambou Martine", phone: "33781668624", email: "christian.cambou@wanadoo.fr", status: "RDV PRIS", campaign: "prospect minceur" },
  { at: "2026-10-19T17:42:27", name: "Edite Edite", phone: "336037683", email: "editevieira1965@hotmail.com", status: "À relancer", note: "1", campaign: "prospect minceur" },
  { at: "2026-10-19T21:17:42", name: "Decorde Genevieve", phone: "33636600934", email: "genevievesereno84@gmail.com", status: "À relancer", note: "2", campaign: "prospect minceur" },
  { at: "2026-10-19T22:18:16", name: "Rebiere Emilie", phone: "33665427925", email: "emilierebiere20@gmail.com", status: "RDV PRIS", note: "1", campaign: "prospect minceur" },
  { at: "2026-10-21T10:07:46", name: "Saldo Dominique", phone: "33610111986", email: "domsaldo@free.fr", status: "RDV PRIS", note: "1", campaign: "prospect minceur" },
  { at: "2026-10-22T09:04:12", name: "ANCIAUX Chantal", phone: "33786657250", email: "anciaux.chantal@gmail.com", status: "À relancer", note: "1", campaign: "prospect minceur" },
  { at: "2026-10-22T13:43:17", name: "Fixon Catherine", phone: "33643880137", email: "catherine.fixon@orange.fr", status: "À relancer", note: "1", campaign: "prospect minceur" },
  { at: "2026-10-22T22:12:50", name: "Giess Valérie", phone: "33788703962", email: "val4ben@gmail.com", status: "À relancer", note: "1", campaign: "prospect minceur" },
  { at: "2026-10-23T08:20:30", name: "SAVARINO Marine", phone: "33629280607", email: "marine.poracchia@gmail.com", status: "RDV PRIS", note: "1", campaign: "prospect minceur" },
  { at: "2026-10-23T09:51:13", name: "Jeandot Vera", phone: "33671635111", email: "jeandotvera@yahoo.fr", status: "", extra: "prospect minceur", note: "1", campaign: "prospect minceur" },
];

const VISAGE: RawRow[] = [
  { at: "2026-10-01T12:47:34.588Z", name: "Chrstelle Lopez cantat", phone: "603248405", email: "causin13@yahoo.fr", zones: "Visage", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-01T12:59:12.852Z", name: "Salem", phone: "650498383", email: "", zones: "Visage", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-01T14:13:59.929Z", name: "Valerie Cauchy", phone: "668161399", email: "val.cauchy@gmail.com", zones: "Cou, Visage", status: "À relancer", note: "5", campaign: "prospect visage" },
  { at: "2026-10-01T14:54:36.231Z", name: "Rose marie Jablanscek", phone: "674450621", email: "rosie.jablanscek@gmail.com", zones: "Plusieurs zones", status: "Reviendra vers nous", note: "3", campaign: "prospect visage" },
  { at: "2026-10-01T15:08:45.954Z", name: "Nathalie Alagna", phone: "695463534", email: "lyly3116@hotmail.fr", zones: "Visage", status: "RDV PRIS", note: "3", campaign: "prospect visage" },
  { at: "2026-10-01T18:11:43.555Z", name: "Catherine Ciret", phone: "685913053", email: "cathy.ciret@gmail.com", zones: "Visage, Cou", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-01T18:12:16.096Z", name: "Marjorie Garcin", phone: "627084667", email: "marjorie13560@aol.com", zones: "Visage", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-01T18:34:52.373Z", name: "Lynda Capdevila", phone: "0751503605", email: "lynda.elyna13800@gmail.com", zones: "Visage, Cou", status: "Numéro invalide", note: "1", campaign: "prospect visage" },
  { at: "2026-10-01T19:10:26.649Z", name: "Celine Chiaramonte", phone: "627162545", email: "chiaramonteceline@yahoo.fr", zones: "Cou, Visage", status: "Prospect perdu", note: "2", campaign: "prospect visage" },
  { at: "2026-10-01T19:16:45.032Z", name: "Caroline", phone: "667796184", email: "farci.caroline@hotmail.fr", zones: "Visage", status: "RDV PRIS", note: "2", campaign: "prospect visage" },
  { at: "2026-10-01T20:54:29.452Z", name: "Maeva", phone: "666646274", email: "", zones: "Visage", status: "À relancer", note: "4", campaign: "prospect visage" },
  { at: "2026-10-01T21:40:21.123Z", name: "Dominique Bechet", phone: "645830732", email: "dominiquebechet@free.fr", zones: "Visage", status: "RDV PRIS", extra: "VENDU OK", note: "1", campaign: "prospect visage" },
  { at: "2026-10-01T23:00:38.573Z", name: "Cathy Hardy", phone: "33771672778", email: "cathy.hardy2023@gmail.com", zones: "Visage, Cou, Décolleté", status: "À relancer", note: "5", campaign: "prospect visage" },
  { at: "2026-10-02T02:41:40.109Z", name: "Fatma Martine Boulkiria", phone: "0609646882", email: "boulkiriamartine13elena@gmail.com", zones: "Visage, Cou", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-02T05:34:24.197Z", name: "Laura Bonnet", phone: "660099152", email: "bonnet-laura@orange.fr", zones: "Visage", status: "RDV PRIS", extra: "VENDU OK", note: "3", campaign: "prospect visage" },
  { at: "2026-10-02T05:52:37.014Z", name: "Françoise Amaurin", phone: "651605896", email: "francoise.amaurin@gmail.com", zones: "Visage", status: "À relancer", note: "2", campaign: "prospect visage" },
  { at: "2026-10-02T06:12:43.795Z", name: "Karima Chouaki", phone: "33698906758", email: "karisou13@hitmail.fr", zones: "Visage", status: "Reviendra vers nous", note: "3", campaign: "prospect visage" },
  { at: "2026-10-02T06:43:47.643Z", name: "Costa Nadine", phone: "614254129", email: "nadine.costamagna@hotmail.com", zones: "Visage", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-02T07:08:42.956Z", name: "Josiane Cerrato", phone: "781877543", email: "josiane.cerrato@gmail.com", zones: "Visage, Cou", status: "Numéro invalide", note: "2", campaign: "prospect visage" },
  { at: "2026-10-02T10:22:31.612Z", name: "Karine Gallardo", phone: "620148789", email: "kari.galla09@gmail.com", zones: "Plusieurs zones", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-02T10:23:17.470Z", name: "Laurence menet", phone: "610833718", email: "", zones: "Visage, Cou", status: "RDV PRIS", note: "4", campaign: "prospect visage" },
  { at: "2026-10-02T11:33:48.311Z", name: "Mandy Marchi", phone: "330622529245", email: "marchimandy@icloud.com", zones: "Visage", status: "Reviendra vers nous", note: "2", campaign: "prospect visage" },
  { at: "2026-10-02T11:47:01.639Z", name: "Bellaize Nathalie", phone: "612326688", email: "nathalie.bellaize@laposte.net", zones: "Visage", status: "RDV PRIS", note: "4", campaign: "prospect visage" },
  { at: "2026-10-05T08:21:58.476Z", name: "Marina ripert", phone: "620820552", email: "marina.abel@live.fr", zones: "Visage", status: "À relancer", note: "4", campaign: "prospect visage" },
  { at: "2026-10-05T22:10:40.036Z", name: "Maassam", phone: "626231897", email: "nadia.maassam@outlook.fr", zones: "Visage", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-05T22:28:51.057Z", name: "Dominique Lei", phone: "614211764", email: "d.ribeiro13@sfr.fr", zones: "Visage", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-06T02:42:41.549Z", name: "Brigitte Rochet Laty", phone: "676703809", email: "rochetlb@yahoo.fr", zones: "Visage", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-06T07:39:23.341Z", name: "Roxane Constans", phone: "762189721", email: "roxaneconstans@gmail.com", zones: "Visage", status: "À relancer", extra: "LG", note: "6", campaign: "prospect visage" },
  { at: "2026-10-06T09:34:11.395Z", name: "Nardi martine", phone: "33687866003", email: "", zones: "Visage", status: "RDV PRIS", extra: "VENDU OK", note: "1", campaign: "prospect visage" },
  { at: "2026-10-06T12:37:39.938Z", name: "Amel Kantour", phone: "33616555976", email: "kantour.pro@gmail.com", zones: "Visage, Cou", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-06T19:10:07.929Z", name: "Danielle Fontaine", phone: "631531037", email: "danya.fte@gmail.com", zones: "Visage, Cou", status: "À relancer, RDV PRIS", note: "3", campaign: "prospect visage" },
  { at: "2026-10-06T19:26:57.672Z", name: "Alexia Baldi", phone: "666934279", email: "alexiabaldi@hotmail.fr", zones: "Visage", status: "À relancer, Reviendra vers nous", note: "4", campaign: "prospect visage" },
  { at: "2026-10-08T11:10:42.032Z", name: "Cécile Comes Molenat", phone: "677679569", email: "cecile.c.molenat@icloud.com", zones: "Visage, Cou", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-09T04:58:58.705Z", name: "Aurore Fregioni", phone: "33626326581", email: "aurore-2106@hotmail.fr", zones: "Visage", status: "À relancer", note: "4", campaign: "prospect visage" },
  { at: "2026-10-09T08:22:24.925Z", name: "Martine Candelon", phone: "664910721", email: "princess013@live.fr", zones: "Visage", status: "Prospect perdu", note: "5", campaign: "prospect visage" },
  { at: "2026-10-09T12:00:00", name: "Sandrine Cisterna", phone: "627872229", email: "sandrine.cisterna@wanadoo.fr", zones: "Visage", status: "À relancer", note: "4", campaign: "prospect visage" },
  { at: "2026-10-10T06:28:56.535Z", name: "Sbeai hajer", phone: "626142271", email: "h.sbeai@laposte.net", zones: "Visage", status: "À relancer", note: "1", campaign: "prospect visage" },
  { at: "2026-10-10T15:30:47.181Z", name: "Brigitte Pennacchi", phone: "644904648", email: "pennacchibrigitte@gmail.com", zones: "Visage", status: "À relancer", note: "4", campaign: "prospect visage" },
  { at: "2026-10-10T18:22:09.612Z", name: "Jocelyne", phone: "619339613", email: "tissier.jocelyne20@gmail.com", zones: "Décolleté, Plusieurs zones, Visage, Cou", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-11T00:09:50.333Z", name: "Cathy Hardy", phone: "33771672778", email: "cathy.hardy2023@gmail.com", zones: "Plusieurs zones", status: "À relancer, Doublon", note: "1", campaign: "prospect visage" },
  { at: "2026-10-11T06:49:43.853Z", name: "Rebiere chantal", phone: "662058301", email: "chantoune013@hotmail.fr", zones: "Visage, Décolleté", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-12T01:25:19.380Z", name: "Cathy Hardy", phone: "771672778", email: "cathy.hardy2023@gmail.com", zones: "Visage", status: "Doublon", campaign: "prospect visage" },
  { at: "2026-10-13T07:54:09.179Z", name: "Sandrine RABANY", phone: "642780654", email: "", zones: "Décolleté, Cou, Visage", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-14T14:00:13.871Z", name: "Angelique morel", phone: "686155170", email: "morel.angie@gmail.com", zones: "Visage, Cou", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-15T05:38:54.092Z", name: "Vidal Vidal", phone: "620376688", email: "nathou2212@yahoo.fr", zones: "Visage", status: "À relancer", note: "5", campaign: "prospect visage" },
  { at: "2026-10-16T02:13:03.486Z", name: "paméla", phone: "33751609631", email: "boyerpam@hotmail.com", zones: "Plusieurs zones", status: "À relancer", note: "5", campaign: "prospect visage" },
  { at: "2026-10-17T05:23:42.080Z", name: "Nathalie SIAS", phone: "33360847421", email: "nathalie.sias@live.fr", zones: "Plusieurs zones", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-17T09:09:32.589Z", name: "Bordier carole", phone: "627704416", email: "mamounettemaiou@gmail.com", zones: "Visage", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-19T00:13:09.712Z", name: "Laurie Pikula", phone: "609155841", email: "lauflolo.m@hotmail.fr", zones: "Plusieurs zones", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-19T01:40:03.769Z", name: "Cathy Hardy", phone: "33771672778", email: "cathy.hardy2023@gmail.com", zones: "Visage, Cou", status: "Doublon", campaign: "prospect visage" },
  { at: "2026-10-19T11:28:41.011Z", name: "Sefsaf Mona", phone: "686680721", email: "", zones: "Visage", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-19T13:12:27.993Z", name: "Stephanie FULLEDA", phone: "631159219", email: "", zones: "Visage", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-19T17:49:42.411Z", name: "Audrey Montaufray", phone: "767132051", email: "", zones: "Visage", status: "À relancer, Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-19T19:14:25.342Z", name: "Laurence Alliot", phone: "618866142", email: "laurence.alliot@bbox.fr", zones: "Visage", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-20T06:30:35.273Z", name: "Corinne Rexach", phone: "611916765", email: "corinneventuri@live.fr", zones: "Plusieurs zones", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-20T06:40:46.276Z", name: "Susanna Moll", phone: "673694132", email: "", zones: "Visage, Cou", status: "À relancer, RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-20T17:03:53.687Z", name: "Sophie PECOUT", phone: "603047732", email: "yukasalon@gmail.com", zones: "Visage, Cou", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-21T10:49:21.009Z", name: "Guarneri Léa", phone: "666476314", email: "leaguarneri1@gmail.com", zones: "Visage", status: "À relancer", note: "3", campaign: "prospect visage" },
  { at: "2026-10-21T15:55:36.126Z", name: "Elisa Cartoux", phone: "785486559", email: "erochette@orange.fr", zones: "Visage", status: "RDV PRIS", note: "1", campaign: "prospect visage" },
  { at: "2026-10-22T02:40:22.608Z", name: "Isabelle BARTHELEMY", phone: "688127828", email: "bartdan@wanadoo.fr", zones: "Visage", status: "À relancer", note: "2", campaign: "prospect visage" },
  { at: "2026-10-22T06:54:49.304Z", name: "Sabrina Clamens", phone: "627889397", email: "sabrina.clamens@gmail.com", zones: "Visage", status: "Prospect perdu", note: "1", campaign: "prospect visage" },
  { at: "2026-10-22T18:14:03.951Z", name: "Corinne PIOVANELLI", phone: "664540129", email: "pivoinecorinne@icloud.com", zones: "Plusieurs zones", status: "À relancer", note: "1", campaign: "prospect visage" },
  { at: "2026-10-22T20:05:45.316Z", name: "JUSTAMON Sylvie", phone: "0624620750", email: "justamonsylvie@gmail.com", zones: "Visage, Plusieurs zones", status: "À relancer", note: "2", campaign: "prospect visage" },
  { at: "2026-10-23T07:30:11.149Z", name: "Djamila Tinouiline", phone: "0623530959", email: "tinouiline.djamila@gmail.com", zones: "Visage, Cou", status: "À relancer", note: "2", campaign: "prospect visage" },
  { at: "2026-10-23T17:26:55.266Z", name: "Boaniche Muriel", phone: "682267927", email: "", zones: "Visage", status: "À relancer", note: "1", campaign: "prospect visage" },
  { at: "2026-10-24T05:40:53.648Z", name: "Carole FOURNIER", phone: "656853361", email: "carole.fournier.withef@gmail.com", zones: "Visage, Cou, Décolleté, Plusieurs zones", status: "Reviendra vers nous", note: "1", campaign: "prospect visage" },
  { at: "2026-10-24T07:44:05.138Z", name: "Stephanie Schneider", phone: "674409477", email: "", zones: "Visage", status: "À relancer", note: "1", campaign: "prospect visage" },
  { at: "2026-10-24T07:52:20.331Z", name: "Regine Constant", phone: "", email: "refine.eden1313@gmail.com", zones: "Visage, Cou", status: "À relancer", note: "1", campaign: "prospect visage" },
  { at: "2026-10-24T08:12:38.175Z", name: "Sylvie POMPA", phone: "610583024", email: "sylviepompa.infirmiere@gmail.com", zones: "Visage, Cou", status: "À relancer", note: "1", campaign: "prospect visage" },
];

function last9(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-9);
}

function toPhone(raw: string) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("330") && digits.length >= 12) {
    digits = `33${digits.slice(3)}`;
  }
  if (digits.startsWith("33") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+33${digits.slice(1)}`;
  if (digits.length === 9 && /^[67]/.test(digits)) return `+33${digits}`;
  if (digits.startsWith("33")) return `+${digits}`;
  return `+${digits}`;
}

function splitName(name: string) {
  const parts = name.trim().replace(/\s+/g, " ").split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function rowKey(row: RawRow) {
  const phone = last9(toPhone(row.phone));
  const email = row.email.trim().toLowerCase();
  if (phone.length >= 8) return `p:${phone}`;
  if (email && email.includes("@")) return `e:${email}`;
  return `n:${row.name.trim().toLowerCase()}`;
}

function buildComment(row: RawRow) {
  return [row.zones, row.extra, row.note ? `Note liste : ${row.note}` : ""]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function preparedRows() {
  const byKey = new Map<string, RawRow>();
  for (const row of [...MINCEUR, ...VISAGE]) {
    const status = normalizeLeadStatus(row.status);
    if (status === "Doublon" && byKey.has(rowKey(row))) {
      continue;
    }
    const key = rowKey(row);
    const previous = byKey.get(key);
    if (!previous || Date.parse(row.at) >= Date.parse(previous.at)) {
      byKey.set(key, {
        ...row,
        status,
        extra: [previous?.extra, row.extra].filter(Boolean).join(" · ") || row.extra,
        zones: row.zones || previous?.zones,
      });
    }
  }
  return [...byKey.values()].filter((row) => normalizeLeadStatus(row.status) !== "Doublon" || !row.email);
}

export async function importPelissanneOctoberLeads() {
  if (readActiveCenterId() !== PELISSANNE_CENTER_ID) {
    throw new Error("Centre actif : ce n’est pas JFG Clinic Pélissanne.");
  }

  const existing = await loadCrmLeads();
  const known = new Set(
    existing.leads.flatMap((lead) => {
      const keys = [];
      const phone = last9(String(lead.phone || ""));
      const email = String(lead.email || "").trim().toLowerCase();
      if (phone.length >= 8) keys.push(`p:${phone}`);
      if (email.includes("@")) keys.push(`e:${email}`);
      return keys;
    }),
  );

  const rows = preparedRows();
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const key = rowKey(row);
    if (known.has(key)) {
      skipped += 1;
      continue;
    }
    const { firstName, lastName } = splitName(row.name);
    try {
      await createCrmLead({
        firstName: firstName || row.name,
        lastName,
        phone: toPhone(row.phone),
        email: row.email.trim(),
        treatment: row.campaign === "prospect visage" ? "Soin visage" : "Soin minceur",
        source: "Organique",
        campaign: row.campaign,
        status: normalizeLeadStatus(row.status),
        dealAmount: 0,
        nextAction: "À contacter",
        comment: buildComment(row) || `Liste octobre · ${row.campaign}`,
        createdAt: new Date(row.at).toISOString(),
        skipNotify: true,
        skipReload: true,
      });
      known.add(key);
      created += 1;
    } catch (error) {
      errors.push(
        `${row.name}: ${error instanceof Error ? error.message : "échec"}`,
      );
    }
  }

  return { created, skipped, errors, total: rows.length };
}
