/**
 * sync-mock-db-copies.js
 * Lê os arquivos _copy.txt da pasta huberick-temp e atualiza o mock-db.js.
 * - Atualiza deals[].copyText com o conteúdo do _copy.txt correspondente.
 * - Atualiza contacts[].whatsapp caso exista telefone, gerando o novo link wa.me codificado.
 *
 * USO:
 *   node scripts/sync-mock-db-copies.js
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const MOCK_DB_PATH = path.join(__dirname, '..', 'js', 'mock-db.js');
const LEADS_DIR    = path.join(__dirname, '..', 'huberick-temp');

function loadMockDb() {
  console.log('📂 Lendo mock-db.js...');
  const raw = fs.readFileSync(MOCK_DB_PATH, 'utf8');
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(raw, sandbox);
  } catch(e) {
    console.warn('⚠️  vm falhou, usando regex fallback:', e.message);
    const dealsMatch    = raw.match(/window\.deals\s*=\s*(\[[\s\S]*?\]);/);
    const contactsMatch = raw.match(/window\.contacts\s*=\s*(\[[\s\S]*?\]);/);
    if (!dealsMatch || !contactsMatch) {
      throw new Error('Não foi possível parsear mock-db.js');
    }
    sandbox.window.deals    = eval(dealsMatch[1]);
    sandbox.window.contacts = eval(contactsMatch[1]);
  }
  return {
    raw,
    deals:    sandbox.window.deals    || [],
    contacts: sandbox.window.contacts || [],
  };
}

(async () => {
  const { raw, deals, contacts } = loadMockDb();
  console.log(`📊 Banco carregado: ${deals.length} deals | ${contacts.length} contatos`);

  let updatedDealsCount = 0;
  let updatedContactsCount = 0;

  // Cria um mapa rápido de contatos por nome para fácil associação
  const contactMap = {};
  contacts.forEach(c => {
    if (c.name) {
      contactMap[c.name.toLowerCase().trim()] = c;
    }
  });

  // Atualiza as cópias e links
  deals.forEach(deal => {
    if (!deal.analysisUrl) return;

    // A partir de huberick-temp/nome-do-lead.html
    // O arquivo de cópia será huberick-temp/nome-do-lead_copy.txt
    const filename = path.basename(deal.analysisUrl);
    const copyFilename = filename.replace('.html', '_copy.txt');
    const copyPath = path.join(LEADS_DIR, copyFilename);

    if (fs.existsSync(copyPath)) {
      const copyText = fs.readFileSync(copyPath, 'utf8').trim();
      
      if (deal.copyText !== copyText) {
        deal.copyText = copyText;
        updatedDealsCount++;
      }

      // Encontra o contato vinculado pelo nome
      const contactKey = deal.name ? deal.name.toLowerCase().trim() : '';
      const contact = contactMap[contactKey];

      if (contact) {
        // Se tem telefone, gera o whatsapp link atualizado
        if (contact.phone && contact.phone !== '—') {
          // Limpa o telefone para pegar apenas os dígitos
          const digits = contact.phone.replace(/\D/g, '');
          if (digits.length >= 8) {
            // Garante o DDI 55 se não tiver
            const formattedPhone = digits.startsWith('55') ? digits : `55${digits}`;
            const newWhatsappLink = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(copyText)}`;
            
            if (contact.whatsapp !== newWhatsappLink) {
              contact.whatsapp = newWhatsappLink;
              updatedContactsCount++;
            }
          }
        }
      }
    }
  });

  console.log(`\n🔄 Sincronizando arquivos locais...`);
  console.log(`   Deals com cópias atualizadas: ${updatedDealsCount}`);
  console.log(`   Contatos com links de WhatsApp atualizados: ${updatedContactsCount}`);

  if (updatedDealsCount > 0 || updatedContactsCount > 0) {
    // Formata os arrays modificados de volta para o JS
    const dealsString = 'window.deals = ' + JSON.stringify(deals, null, 2) + ';';
    const contactsString = 'window.contacts = ' + JSON.stringify(contacts, null, 2) + ';';

    // Substitui no conteúdo original do mock-db.js
    let newDbContent = raw.replace(/window\.deals\s*=\s*\[[\s\S]*?\];/g, dealsString);
    newDbContent = newDbContent.replace(/window\.contacts\s*=\s*\[[\s\S]*?\];/g, contactsString);

    fs.writeFileSync(MOCK_DB_PATH, newDbContent, 'utf8');
    console.log('✅ mock-db.js atualizado e salvo com sucesso!');
  } else {
    console.log('✨ Nada para atualizar, tudo já está sincronizado.');
  }
})();
