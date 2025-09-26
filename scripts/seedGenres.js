// scripts/seed_musicGenres.cjs
require('dotenv/config');
const admin = require('firebase-admin');
const serviceAccount = require("../service-account.json");


if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("[FirebaseAdmin] inicializado con service-account.json");
  }

const db = admin.firestore();

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const GENRES = [
  {
    genre: 'Música Electrónica',
    subgenres: [
      'House','Techno','Trance','Dubstep','Drum and Bass','Future Bass','Hardstyle',
      'Minimal Techno','Melodic Techno','Hard Techno','Acid House','Chillout','Big Room',
      'Electro House','Psytrance','Trap (EDM)','Jungle','Glitch Hop','Ambient','Complextro',
      'Progressive House','Moombahton'
    ],
  },
  {
    genre: 'Rock',
    subgenres: [
      'Punk','Afro-punk','Anarcho punk','Glam punk','Gothic punk','Post-punk','Post-punk revival',
      'Psychedelic rock','Prog rock','Grunge','Garage punk','Power metal','Thrash metal',
      'Progressive rock','Metalcore','Rap rock','Punk blues','Psychedelic folk','Surf rock',
      'Math rock','Power pop','Pop punk'
    ],
  },
  {
    genre: 'Pop',
    subgenres: [
      'Teen Pop','Pop Rock','Pop Punk','Synthpop','Electropop','K-Pop','J-Pop',
      'Dream Pop','Hyperpop','Bubblegum Pop'
    ],
  },
  {
    genre: 'Hip-Hop / Rap',
    subgenres: [
      'Alternative Hip-Hop','Experimental Hip-Hop','Boom bap','Bounce','British hip-hop',
      'Cloud rap','Crunk','Crunkcore','Gangsta rap','Horrorcore','Lofi hip-hop','Miami bass',
      'Mumble rap','Snap music','Drill (UK/Latin/Brooklyn)','Latin trap','Phonk','Pluggnb',
      'Trap music','Jazz rap'
    ],
  },
  {
    genre: 'Jazz',
    subgenres: [
      'Bebop','Swing','Cool Jazz','Smooth Jazz','Free Jazz','Acid Jazz',
      'Jazz Fusion','Dixieland','Gypsy Jazz','Traditional Jazz'
    ],
  },
  {
    genre: 'Clásica',
    subgenres: [
      'Baroque','Classical Period','Romantic','Minimalism','Modern Classical',
      'Contemporary Classical','Chamber Music','Opera','Avant-garde classical',
      'New Age/Classical crossover'
    ],
  },
  {
    genre: 'Metal',
    subgenres: [
      'Alternative metal','Avant-garde metal','Black metal','Death metal','Doom metal','Folk metal',
      'Glam metal','Gothic metal','Industrial metal','Metalcore','Neoclassical metal','Power metal',
      'Progressive metal (Djent)','Sludge metal','Speed metal','Symphonic metal','Christian metal',
      'Pirate metal','Math metal','Kawaii metal'
    ],
  },
  {
    genre: 'R&B / Soul',
    subgenres: [
      'Alternative R&B','Contemporary R&B','Disco',
      'Funk (Deep funk / Minneapolis Sound / Psychedelic funk)',
      'Gospel (Southern / Urban)','New jack swing','Post-disco (Boogie)','Doo-wop',
      'Blue-eyed soul','Classic soul','Hip-hop soul','Neo soul','Northern soul',
      'Quiet storm','Psychedelic soul'
    ],
  },
  {
    genre: 'Country',
    subgenres: [
      'Alternative Country','Americana','Bluegrass (Progressive/Traditional)','Classic Country',
      'Contemporary Country','Country Pop','Country Rap','Country Rock','Honky Tonk',
      'Neotraditional Country','Outlaw Country','Progressive Bluegrass','Cowboys/Western',
      'Texas Country','Sertanejo','Franco-Country','Psychobilly','Dansband','Urban Cowboy',
      'Western Swing'
    ],
  },
  {
    genre: 'Blues',
    subgenres: [
      'Delta Blues','Chicago Blues','Electric Blues','Country Blues','Texas Blues','Blues Rock'
    ],
  },
  {
    genre: 'Reggae',
    subgenres: [
      'Roots Reggae','Dub','Dancehall','Reggaetón'
    ],
  },
  {
    genre: 'Latin / Música Latina',
    subgenres: [
      'Salsa','Merengue','Reggaetón','Bachata','Latin Pop','Cumbia'
    ],
  },
  {
    genre: 'Folk / Acústica',
    subgenres: [
      'Acoustic Pop','Americana','Bluegrass','Folk Rock'
    ],
  },
  {
    genre: 'Gospel',
    subgenres: [
      'Urban Contemporary Gospel','Contemporary Gospel','Christian Gospel','Traditional Gospel'
    ],
  },
  {
    genre: 'World Music',
    subgenres: [
      'Afrobeat','Celtic','Klezmer'
    ],
  },
  {
    genre: 'New Age',
    subgenres: [
      'Meditation Music','Healing Music','Ambient New Age','Ethereal Wave','New Age crossover'
    ],
  },
  {
    genre: 'Punk',
    subgenres: [
      'Hardcore Punk','Pop Punk','Post-Punk','Skate Punk','Anarcho-Punk','Crust Punk','Emo','Psychobilly'
    ],
  },
  {
    genre: 'Experimental / Avant-Garde',
    subgenres: [
      'Avant-Garde','Noise','Industrial','Glitch','Drone'
    ],
  },
  {
    genre: 'Soundtrack / Música para medios',
    subgenres: [
      'Film Score','Video Game Music','Musical Theater','Anime Soundtracks'
    ],
  },
  {
    genre: 'Comedy / Infantil / Estacional',
    subgenres: [
      "Children's Music: Lullabies","Children's Music: Educational Songs","Children's Music: Sing-Along",
      'Seasonal: Christmas Music','Seasonal: Holiday Music','Seasonal: Summer Anthems'
    ],
  },
  {
    genre: 'Alternative / Indie',
    subgenres: [
      'Alternative Rock','Indie Pop','Shoegaze','Post-Rock','Emo'
    ],
  },
  {
    genre: 'Ska / Swing / Easy Listening',
    subgenres: [
      'Ska','Swing Revival','Easy Listening','Lounge'
    ],
  },
  {
    genre: 'Exótica / Polka / Muzak',
    subgenres: [
      'Exotica','Polka','Muzak (Elevator Music)'
    ],
  },
  {
    genre: 'Afrobeat',
    subgenres: [
      'Afrobeat'
    ],
  },
  {
    genre: 'Vaporwave / Retrowave',
    subgenres: [
      'Vaporwave','Math Rock' // (mencionado junto aunque no relacionado)
    ],
  },
  {
    genre: 'Trip-Hop',
    subgenres: ['Trip-Hop'],
  },
  {
    genre: 'Afro-Latino / Urbano',
    subgenres: [
      'Reggaetón','Hip-Hop en español','Latin trap','Dembow','Champeta urbana','Baile funk (Funk carioca)'
    ],
  },
  {
    genre: 'Microgéneros',
    subgenres: [
      'Alternative R&B','Art Pop','Baltimore club','Brostep','Chillwave','Cloud rap','Complextro',
      'Electroclash','Future funk','Future house','Hyperpop','Lo-fi hip hop','Mumble rap','Moombahton',
      'Nightcore','Seapunk','Synthwave','Vaporwave','Witch house','Wonky'
    ],
  },
  {
    genre: 'Jazz Electrónico / Electronica',
    subgenres: [
      'Electronica','Folktronica','Nu jazz (Jazztronica)','Live electronic (Livetronica)',
      'Progressive electronic','Glitch'
    ],
  },
  {
    genre: 'Industrial / Noise',
    subgenres: [
      'Industrial hardcore','Power electronics','Harsh noise','Noise music','Electro-industrial','Witch house'
    ],
  },
];

async function main() {
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  GENRES.forEach((g, idx) => {
    const slug = slugify(g.genre);
    // dedupe y trim subgéneros
    const subs = Array.from(
      new Set((g.subgenres || []).map((s) => String(s).trim()).filter(Boolean))
    );

    const ref = db.collection('musicGenres').doc(slug);
    batch.set(
      ref,
      {
        genre: g.genre,
        subgenres: subs,
        slug,
        order: idx + 1,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  await batch.commit();
  console.log(`✔ Seed completado: ${GENRES.length} géneros en musicGenres`);

  // (Opcional) índice plano de subgéneros para autocompletar rápido
  const allSubs = Array.from(
    new Set(GENRES.flatMap((g) => g.subgenres || []).map((s) => String(s).trim()))
  ).sort((a, b) => a.localeCompare(b));
  await db
    .collection('musicGenres')
    .doc('_meta')
    .set(
      { allSubgenres: allSubs, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  console.log(`✔ _meta/allSubgenres: ${allSubs.length} subgéneros`);
}

main().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});