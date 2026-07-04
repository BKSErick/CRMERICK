const fs = require('fs');
const path = require('path');

const leadsDir = 'D:\\001Gravity\\CRM ERICK\\huberick-temp';
const mockDbPath = 'D:\\001Gravity\\CRM ERICK\\js\\mock-db.js';

// Owner Meta reference for distributing leads
const ownerMeta = {
  JM: { initials: 'JM', cls: 'av-mira', name: 'João M.' },
  CS: { initials: 'CS', cls: 'av-cale', name: 'Carla S.' },
  PA: { initials: 'PA', cls: 'av-pri', name: 'Pedro A.' },
  AL: { initials: 'AL', cls: 'av-al', name: 'Ana L.' },
  RT: { initials: 'RT', cls: 'av-rt', name: 'Rafael T.' }
};
const ownerKeys = Object.keys(ownerMeta);

// Helper to get initials
function getInitials(name) {
  const parts = name.split(/\s+/).filter(p => p.length > 0);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return 'LD';
}

console.log('Reading database from: ' + mockDbPath);

// Read current mock-db.js content to preserve everything else
let dbContent = fs.readFileSync(mockDbPath, 'utf8');

// Parse lead files
console.log('Scanning leads directory: ' + leadsDir);
const files = fs.readdirSync(leadsDir);
const htmlFiles = files.filter(f => f.endsWith('.html') && f.toLowerCase() !== 'index.html');

console.log(`Found ${htmlFiles.length} lead HTML files.`);

const parsedDeals = [];
const parsedContacts = [];

let startId = 100;

htmlFiles.forEach((file, index) => {
  const filePath = path.join(leadsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract Title from h1 or title tag
  let title = '';
  const h1Match = content.match(/<h1>([^<]+)<\/h1>/i);
  if (h1Match) {
    title = h1Match[1].trim();
  } else {
    const titleMatch = content.match(/<title>Analise Digital - ([^<]+)<\/title>/i) || content.match(/<title>([^<]+)<\/title>/i);
    title = titleMatch ? titleMatch[1].trim() : 'Empresa sem Nome';
  }
  
  // Clean name
  if (title.startsWith('Analise Digital - ')) {
    title = title.replace('Analise Digital - ', '');
  }
  
  // Split company name and segment
  let company = title;
  let segment = '';
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    company = parts[0].trim();
    segment = parts[1].trim();
  }
  
  // Extract site url
  let siteUrl = '—';
  const siteMatch = content.match(/Site avaliado:\s*(https?:\/\/[^\s<"'`,]+)/i);
  if (siteMatch) {
    siteUrl = siteMatch[1].trim();
    if (siteUrl.endsWith('.')) {
      siteUrl = siteUrl.substring(0, siteUrl.length - 1);
    }
  } else {
    // Try to find link inside content
    const urlMatch = content.match(/(https?:\/\/(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s<"'`,]*)/i);
    if (urlMatch) {
      siteUrl = urlMatch[1].trim();
      if (siteUrl.endsWith('.')) {
        siteUrl = siteUrl.substring(0, siteUrl.length - 1);
      }
    }
  }
  
  // Extract score
  let score = 0;
  const scoreMatch = content.match(/font-weight:800;background:radial-gradient[^>]*>([^<]+)<\/div>/i) || content.match(/font-size:1\.25rem;font-weight:800;[^>]*>([^<]+)<\/div>/i);
  if (scoreMatch) {
    const scoreVal = parseInt(scoreMatch[1].trim());
    if (!isNaN(scoreVal)) {
      score = scoreVal;
    }
  }
  
  // Read copywriting file
  const copyFile = file.replace('.html', '_copy.txt');
  const copyPath = path.join(leadsDir, copyFile);
  let copyText = '';
  if (fs.existsSync(copyPath)) {
    copyText = fs.readFileSync(copyPath, 'utf8').trim();
  }
  
  const id = startId + index;
  
  // Distribute owner
  const ownerCode = ownerKeys[index % ownerKeys.length];
  const owner = ownerMeta[ownerCode];
  
  // Create Deal
  parsedDeals.push({
    id: id,
    name: title,
    company: company,
    value: 0,
    prob: 0,
    stage: 'prospect',
    owner: ownerCode,
    ownerName: owner.name,
    close: '—',
    tag: 'Outbound',
    tagType: 'research',
    ticketId: 'LEAD-' + id,
    points: score || Math.floor(Math.random() * 4) + 1,
    progress: 0,
    assignee: ownerCode,
    analysisUrl: 'huberick-temp/' + file,
    copyText: copyText,
    siteUrl: siteUrl,
    segment: segment
  });
  
  // Create Contact
  parsedContacts.push({
    name: title,
    company: company,
    email: '—',
    phone: '—',
    status: 'lead',
    initials: getInitials(company),
    owner: ownerCode,
    ownerName: owner.name
  });
});

console.log(`Parsed ${parsedDeals.length} deals and ${parsedContacts.length} contacts.`);

// Read original mock arrays
const originalDealsMatch = dbContent.match(/window\.deals = (\[[\s\S]*?\]);/);
const originalContactsMatch = dbContent.match(/window\.contacts = (\[[\s\S]*?\]);/);

if (!originalDealsMatch || !originalContactsMatch) {
  console.error('Could not parse original window.deals or window.contacts from mock-db.js');
  process.exit(1);
}

// Convert them programmatically (safely using eval in Node block or parsing as JSON if simple)
const originalDeals = eval(originalDealsMatch[1]);
const originalContacts = eval(originalContactsMatch[1]);

console.log(`Original database had ${originalDeals.length} deals and ${originalContacts.length} contacts.`);

// Merge them
const mergedDeals = [...originalDeals, ...parsedDeals];
const mergedContacts = [...originalContacts, ...parsedContacts];

// Format deals and contacts array back to JS string
const dealsString = 'window.deals = ' + JSON.stringify(mergedDeals, null, 2) + ';';
const contactsString = 'window.contacts = ' + JSON.stringify(mergedContacts, null, 2) + ';';

// Replace in database content
let newDbContent = dbContent.replace(/window\.deals = \[[\s\S]*?\];/g, dealsString);
newDbContent = newDbContent.replace(/window\.contacts = \[[\s\S]*?\];/g, contactsString);
newDbContent = newDbContent.replace(/window\.contactsDB = window\.contacts;/g, 'window.contactsDB = window.contacts;');

fs.writeFileSync(mockDbPath, newDbContent, 'utf8');

console.log('Import successfully merged and saved to mock-db.js!');
