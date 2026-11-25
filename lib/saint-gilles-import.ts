import { readActiveCenterId } from "@/lib/center-access";
import { createCrmLead, loadCrmLeads } from "@/lib/crm-supabase";
import { normalizeLeadStatus } from "@/lib/lead-statuses";
import type { LeadStatus } from "@/types/lead";

export const SAINT_GILLES_CENTER_ID = "7359d418-7569-47e0-910e-a5eb96ecd9a7";

type RawRow = {
  at: string;
  name: string;
  phone: string;
  email: string;
  offer: string;
  status: string;
};

const ROWS: RawRow[] = [
  { at: "2026-09-14T18:20:53.000Z", name: "Martine de Bourgonière", phone: "33661458633", email: "eddy.martine2@orange.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-14T18:30:35.000Z", name: "corlou", phone: "33610289680", email: "lydie.corlou@sfr.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-14T19:30:27.000Z", name: "Partricia Fradin", phone: "33613591833", email: "partriciafradin@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-16T13:58:12.000Z", name: "Ransay", phone: "33610289680", email: "lydie.corlou@sfr.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Doublon" },
  { at: "2026-09-16T19:22:39.000Z", name: "Cathy ORDONNEAU", phone: "666380987", email: "ordonneau.cathy@orange.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-18T13:13:57.000Z", name: "Chauvin Elena", phone: "658887238", email: "elenakolesnik31@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-18T04:53:18.000Z", name: "Melanie Champigny", phone: "781382991", email: "tonymelanie@hotmail.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Souhaite être rappelé(e) plus trad, Reviendra vers nous" },
  { at: "2026-09-18T13:46:02.000Z", name: "Marie christine Stroheker", phone: "620494880", email: "mariechristinestro21@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Reviendra vers nous" },
  { at: "2026-09-18T12:05:24.000Z", name: "VRIGNAUD", phone: "650862495", email: "nadinevrignaud85@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-18T15:11:17.000Z", name: "Corinne Guignard", phone: "614351827", email: "corinne-delaunay@wanadoo.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, Message vocal laissé, Souhaite être rappelé(e) plus trad" },
  { at: "2026-09-19T05:59:47.000Z", name: "VRIGNAUD", phone: "650862495", email: "nadinevrignaud85@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Doublon" },
  { at: "2026-09-19T23:27:31.000Z", name: "Vaswani", phone: "620030491", email: "tamdasa@aol.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-19T19:07:50.000Z", name: "Christine mornet", phone: "641988870", email: "Christine.mornet@hotmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-19T11:17:53.000Z", name: "Nelly Lambert", phone: "652553464", email: "nelly.lamb85@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-20T14:57:03.000Z", name: "laetitia PÉRUS FOUCAULT", phone: "33672283097", email: "foucault.laetitia3@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Numéro invalide" },
  { at: "2026-09-20T12:46:09.000Z", name: "Estelle Poireaud", phone: "604053138", email: "epoireaud@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-20T20:29:49.000Z", name: "Natacha BOUCAULT", phone: "658893906", email: "natacha.boucaultdavid@hotmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé, Reviendra vers nous" },
  { at: "2026-09-21T12:02:25.000Z", name: "Cindy Laligant", phone: "614126828", email: "nalachelsea85@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-21T12:16:00.000Z", name: "Partricia Fradin", phone: "613591833", email: "partriciafradin@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-22T04:56:15.000Z", name: "Gateau Evelyne", phone: "662354792", email: "evelyne.gateau@orange.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-22T22:20:45.000Z", name: "Valérie Fricheau", phone: "638236061", email: "valerie.mhm@hotmail.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-23T12:32:57.000Z", name: "Isabelle Suzanne", phone: "611508883", email: "isabelle.suzanne35@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé, RDV PRIS" },
  { at: "2026-09-24T19:22:36.000Z", name: "Mélanie Pigeat", phone: "699008407", email: "mel.pigeat@wanadoo.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-25T12:06:34.000Z", name: "NEAU Marcel", phone: "650715904", email: "marcelneau@yahoo.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-26T18:49:42.000Z", name: "Dussollier Martine", phone: "618461035", email: "mlagauffre@neuf.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-26T19:26:03.000Z", name: "Delavault Nathalie", phone: "663836771", email: "chabrol.family@orange.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-27T19:23:15.000Z", name: "marine fournier", phone: "664247612", email: "marine1385.f@outlook.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-28T19:43:37.000Z", name: "Lecomte sandra", phone: "33610732398", email: "pauch2008@live.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-09-28T21:29:05.000Z", name: "MALOBERTI Soriya", phone: "664843432", email: "sunsorya99@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-29T12:40:35.000Z", name: "Karine Poiraud", phone: "777335688", email: "karine.poiraud@sfr.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-29T19:56:30.000Z", name: "Menanteau Cathy", phone: "634672873", email: "cathymenanteau@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-09-30T15:56:40.000Z", name: "Alexandra Transon", phone: "638963858", email: "transon.alex@orange.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Hors zone" },
  { at: "2026-09-30T18:17:40.000Z", name: "Audrey Roncali", phone: "680675193", email: "audrey.astro@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé, RDV PRIS" },
  { at: "2026-10-02T21:25:19.000Z", name: "Zaia Kaya", phone: "662299728", email: "zaiahammiche8@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-02T21:32:35.000Z", name: "Myriam GERHARD", phone: "621770355", email: "myloumat.gerhard@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-03T13:34:02.000Z", name: "Valérie Pichon", phone: "750988672", email: "valmelmeg@live.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-04T18:28:02.000Z", name: "Isabelle Dumont", phone: "626041855", email: "isa71fab72@yahoo.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-04T21:24:23.000Z", name: "Martine Chapelle", phone: "630465231", email: "martine287@hotmail.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-07T04:49:13.000Z", name: "Katia saurel", phone: "762751570", email: "katia-saurel@bbox.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-07T10:04:00.000Z", name: "Thierry Blondiau", phone: "33784358242", email: "Blondiauthierry766@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-07T19:11:00.000Z", name: "Nadege Sima", phone: "33680738989", email: "nadegesima@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-07T21:07:38.000Z", name: "Laurence Vaussy", phone: "769208633", email: "lolovaussy@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Hors zone" },
  { at: "2026-10-08T15:24:00.000Z", name: "Patrick Dain", phone: "33682636782", email: "dainpatrick8@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-09T19:26:05.000Z", name: "Stoklosa", phone: "626315792", email: "stoklosacorinne23@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-10-10T22:17:47.000Z", name: "Beatrice Groizeleau", phone: "627166012", email: "makyen.groizeleau@orange.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Reviendra vers nous" },
  { at: "2026-10-11T15:03:00.000Z", name: "Norbert Brione", phone: "33610434933", email: "nono210857@hotmail.com", offer: "LASER-25", status: "PI" },
  { at: "2026-10-11T16:55:00.000Z", name: "Nanie Beha", phone: "33641313025", email: "lanfrey.marie@sfr.fr", offer: "LASER-25", status: "Apl en abs, SMS envoyé, Hors zone" },
  { at: "2026-10-11T15:08:47.000Z", name: "Viviane leveque", phone: "642839174", email: "vanie85140@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-11T20:49:56.000Z", name: "catherine", phone: "622506319", email: "nigoncatherine@yahoo.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-13T08:47:00.000Z", name: "Mitch Guitars", phone: "603536990", email: "michel.razzolini@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-13T11:01:17.000Z", name: "Hélène Nollevalle", phone: "664121293", email: "helenedubrulle.hd@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-13T22:30:59.000Z", name: "Jacqueline Ménard", phone: "611212148", email: "kakine85300@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé, RDV PRIS" },
  { at: "2026-10-14T08:22:00.000Z", name: "Chloé Lalouve", phone: "424120465", email: "lavoixduplaisir@gmail.com", offer: "LASER-25", status: "Numéro invalide" },
  { at: "2026-10-14T13:13:22.000Z", name: "Nathalie Guerin", phone: "626740231", email: "nathalie.guerin30@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-10-14T18:22:53.000Z", name: "Claire Deshaies", phone: "665903160", email: "clairette0467@hotmail.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-14T23:41:00.000Z", name: "Lilie Vernou", phone: "33783148161", email: "fredrachelvernou49@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé, Hors zone" },
  { at: "2026-10-15T01:28:00.000Z", name: "Laila Hanine", phone: "212620815434", email: "laila.hanine3005@gmail.com", offer: "LASER-25", status: "Hors zone" },
  { at: "2026-10-15T08:53:00.000Z", name: "Loubna Mulhou", phone: "621990499", email: "loubnamulou@gmail.com", offer: "LASER-25", status: "Hors zone" },
  { at: "2026-10-15T10:03:46.000Z", name: "Pascale Briand", phone: "770771089", email: "briandpascale485@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé, RDV PRIS" },
  { at: "2026-10-15T15:29:00.000Z", name: "Philippe Hemery", phone: "33647025122", email: "philippe.hemery18@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-15T19:25:11.000Z", name: "BESSONNET Christine", phone: "625703619", email: "c.chantreau@orange.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-10-15T21:22:10.000Z", name: "Marielle Rondeau", phone: "683178070", email: "marielle.rondeau22@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Reviendra vers nous" },
  { at: "2026-10-16T05:08:00.000Z", name: "Oli Vie", phone: "33635157399", email: "garciaolivie@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-16T05:35:02.000Z", name: "Bourcereau Patricia", phone: "676277326", email: "pbbulles@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-16T14:30:00.000Z", name: "Manuel Marques", phone: "33698902723", email: "manuel.marques22780@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-16T18:43:00.000Z", name: "Roselyne Ometz", phone: "213780376679", email: "ometz.roselyne@orange.fr", offer: "LASER-25", status: "Hors zone" },
  { at: "2026-10-16T19:50:00.000Z", name: "Chantal Guillaumot", phone: "33614680498", email: "chantalguillaumot@sico.net", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-16T20:29:00.000Z", name: "Catherine Loyer", phone: "33658232039", email: "mejeancatherine34@gmail.com", offer: "LASER-25", status: "Hors zone" },
  { at: "2026-10-17T15:18:00.000Z", name: "Pascal Bizouarne", phone: "33688246519", email: "pascal.bizouarne@wanadoo.fr", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-18T09:02:00.000Z", name: "Alain Mekki", phone: "33680152877", email: "mekkialain@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-18T18:00:30.000Z", name: "Sandrine LESELLIER", phone: "626867247", email: "lesa6133@laposte.net", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-18T19:09:47.000Z", name: "Frederique Desson", phone: "615921085", email: "frederique.desson@sfr.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-18T20:47:28.000Z", name: "Cristina Varela", phone: "676210840", email: "kikigalicia@hotmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Reviendra vers nous" },
  { at: "2026-10-19T06:12:00.000Z", name: "Raymonde sagorin", phone: "33642581397", email: "Moniquesagorin95100@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-19T09:36:00.000Z", name: "Regine Cascon", phone: "33632383181", email: "regine.cascon@orange.fr", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-19T09:55:00.000Z", name: "Louis Tanavelle", phone: "33687057018", email: "tanavellel@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-19T12:48:38.000Z", name: "Katia saurel", phone: "762751570", email: "katia-saurel@bbox.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Doublon" },
  { at: "2026-10-20T03:02:00.000Z", name: "Joelle Gaillotte", phone: "33745858523", email: "joellegaillotte2403@icloud.com", offer: "LASER-25", status: "Hors zone" },
  { at: "2026-10-20T19:22:00.000Z", name: "Marie-Frédérique Aubin", phone: "33621233544", email: "didi59640@msn.com", offer: "LASER-25", status: "PI" },
  { at: "2026-10-21T00:48:17.000Z", name: "Dipayen", phone: "771779450", email: "dipayenisabelle@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-21T05:51:20.000Z", name: "Katia saurel", phone: "762751570", email: "katia-saurel@bbox.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Doublon" },
  { at: "2026-10-21T09:57:00.000Z", name: "Murielle Philipps", phone: "33630259684", email: "mumup5@hotmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-21T16:23:00.000Z", name: "Jany Decarriere", phone: "33682289332", email: "janyeric85@gmail.com", offer: "LASER-25", status: "Prospect perdu" },
  { at: "2026-10-21T14:32:16.000Z", name: "Karine Sastre", phone: "33674548049", email: "ksbtahiti@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-21T16:40:00.000Z", name: "Arlette Maurin", phone: "33610610180", email: "arlettemaurin2@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-21T20:13:06.000Z", name: "Camille Griffon", phone: "635159248", email: "camcha12@hotmail.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-22T04:00:00.000Z", name: "Caty Martegoutte", phone: "609505387", email: "catherine24290@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé, Hors zone" },
  { at: "2026-10-22T05:17:00.000Z", name: "Annie Raffanel", phone: "33630355238", email: "raffanel.annie@gmail.com", offer: "LASER-25", status: "PI" },
  { at: "2026-10-22T09:05:00.000Z", name: "Nadine Debard", phone: "33631850081", email: "sundydebard@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-23T01:47:23.000Z", name: "Laila Alaoui", phone: "603111297", email: "lailaalaoui212@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-23T13:58:00.000Z", name: "Парикмахер временно французский;)", phone: "33695857183", email: "moskalinka79@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-23T12:55:51.000Z", name: "Yannick Genin", phone: "616913354", email: "duramask@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-23T14:24:02.000Z", name: "Alexandra Launay", phone: "06 24 72 47 36", email: "alexandralaunay8@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-23T20:34:12.000Z", name: "Lily Calvouz", phone: "658922335", email: "aurelycalvez@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Hors zone" },
  { at: "2026-10-24T06:28:52.000Z", name: "Christine chereau", phone: "686979086", email: "chereau@hotmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "RDV PRIS" },
  { at: "2026-10-24T09:28:00.000Z", name: "Veronique bonnion", phone: "33671612343", email: "verodtoallo@live.fr", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-24T14:17:44.000Z", name: "Picard Margareth", phone: "662784676", email: "margaret.picard@bboc.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-24T18:05:00.000Z", name: "Amélie Collet", phone: "33613813234", email: "ameliecollet31@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-25T06:51:30.000Z", name: "Sandrine Charrier", phone: "650723105", email: "charriersandrine85430@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-25T15:39:00.000Z", name: "Tulay Kinay", phone: "33676689821", email: "blackhole-ma2_peuchx2ga-fkk9t7j8pwmpva4qhb9ewhaeohnfnse-1619060277@devnull.facebook.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé, Numéro invalide" },
  { at: "2026-10-25T16:44:00.000Z", name: "Martine Greff", phone: "33622724967", email: "greffmartine@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-25T20:29:00.000Z", name: "Phil Le", phone: "33786150626", email: "philippelebrun064@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-25T22:46:00.000Z", name: "Fabienne Lurin", phone: "33681543561", email: "fab.lur@orange.fr", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-26T06:29:32.000Z", name: "Sabrina Gautier", phone: "33676758518", email: "sabrigautier@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-26T15:58:47.000Z", name: "Léa Vodarzac", phone: "783140638", email: "leadz@icloud.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-28T15:14:22.000Z", name: "Fernande Roy", phone: "609541725", email: "jeanfefe59@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-29T06:50:00.000Z", name: "Stephane Girardot", phone: "33687368315", email: "girardot.stef@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-10-30T14:36:00.000Z", name: "Bzh Franck", phone: "33619305133", email: "y.laurent88@laposte.net", offer: "LASER-25", status: "Hors zone" },
  { at: "2026-10-30T15:00:00.000Z", name: "Anne Vauché", phone: "33763676380", email: "Anne.vauche.85@gmail.com", offer: "LASER-25", status: "Apl en abs, SMS envoyé" },
  { at: "2026-11-23T07:36:24.000Z", name: "Angelique", phone: "06 35 22 50 52", email: "ninilelievre@yahoo.fr", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "" },
  { at: "2026-11-23T16:16:34.000Z", name: "TEST WEBK", phone: "613277582", email: "reseaubeauteexclusive@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "" },
  { at: "2026-11-23T17:30:51.000Z", name: "Christine", phone: "33622394322", email: "", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "" },
  { at: "2026-11-23T17:58:47.000Z", name: "Magali Lebold", phone: "619862600", email: "mlb.lebold@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "" },
  { at: "2026-11-24T17:48:42.000Z", name: "Hélène", phone: "664121293", email: "helenedubrulle.hd@gmail.com", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "" },
  { at: "2026-11-24T21:01:00.000Z", name: "Sandrine LESELLIER", phone: "626867247", email: "lesa6133@laposte.net", offer: "Bilan + séance découverte 29€ + -25% sur les cures", status: "" },
];

function last9(phone: string) {
  return phone.replace(/\D/g, "").slice(-9);
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
    return { firstName: parts[0] || "Prospect", lastName: "" };
  }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function rowKey(row: RawRow) {
  const phone = last9(toPhone(row.phone));
  const email = row.email.trim().toLowerCase();
  if (phone.length >= 8) return `p:${phone}`;
  if (email.includes("@")) return `e:${email}`;
  return `n:${row.name.trim().toLowerCase()}`;
}

function currentStatus(raw: string): LeadStatus {
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "Nouveau";
  return normalizeLeadStatus(parts[parts.length - 1]);
}

function treatmentFor(offer: string) {
  return /laser/i.test(offer) ? "Épilation définitive" : "Soin minceur";
}

function preparedRows() {
  const byKey = new Map<string, RawRow & { statusLabel: LeadStatus }>();
  for (const row of ROWS) {
    const statusLabel = currentStatus(row.status);
    const key = rowKey(row);
    const previous = byKey.get(key);
    if (statusLabel === "Doublon" && previous) continue;
    if (previous && statusLabel === "Nouveau" && previous.statusLabel !== "Nouveau") continue;
    if (!previous || Date.parse(row.at) >= Date.parse(previous.at)) {
      byKey.set(key, { ...row, statusLabel });
    }
  }
  return [...byKey.values()];
}

export async function importSaintGillesLeads() {
  if (readActiveCenterId() !== SAINT_GILLES_CENTER_ID) {
    throw new Error("Centre actif : ce n'est pas Beauty Success Saint-Gilles-Croix-de-Vie.");
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
    const chain = row.status.includes(",") ? `Statuts : ${row.status}` : "";
    try {
      await createCrmLead({
        firstName,
        lastName,
        phone: toPhone(row.phone),
        email: row.email.trim(),
        treatment: treatmentFor(row.offer),
        source: "Facebook",
        campaign: row.offer,
        status: row.statusLabel,
        dealAmount: 0,
        nextAction: "À contacter",
        comment: chain,
        createdAt: row.at,
        skipNotify: true,
        skipReload: true,
      });
      known.add(key);
      created += 1;
    } catch (error) {
      errors.push(`${row.name}: ${error instanceof Error ? error.message : "échec"}`);
    }
  }

  return { created, skipped, errors, total: rows.length };
}
