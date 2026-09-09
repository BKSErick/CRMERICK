// Lista de enderecos que NAO podem receber e-mail, e por quanto tempo.
//
// Existe porque endereco vetado voltava a cada rebuild da fila: o build nasce dos
// deals do Supabase, entao cortar o `email_queue.json` na mao so durava um lote.
// Hard bounce reaparecendo e o jeito mais rapido de queimar dominio novo.
//
// Formato do blocklist.json (chave = e-mail em minusculo):
//   "alguem@x.com.br": { "motivo": "hard_bounce", "desde": "2026-09-09", "ate": null }
//
// `ate: null`  -> bloqueio PERMANENTE (endereco morto, spam, descadastro)
// `ate: "data" -> QUARENTENA ate essa data (soft bounce: a caixa existe, so falhou)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const BLOCKLIST_PATH = path.join(AQUI, 'blocklist.json');

// Quanto tempo cada motivo tira o endereco de circulacao. Soft bounce e temporario
// (caixa cheia, servidor fora do ar), entao volta sozinho depois do descanso.
export const QUARENTENA_DIAS = { soft_bounce: 7, deferred: 3 };

export function lerBlocklist(arquivo = BLOCKLIST_PATH) {
  try {
    const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    return bruto && typeof bruto === 'object' ? bruto : {};
  } catch {
    return {};
  }
}

export function salvarBlocklist(lista, arquivo = BLOCKLIST_PATH) {
  fs.writeFileSync(arquivo, JSON.stringify(lista, null, 1), 'utf8');
}

/** Bloqueado agora? Quarentena vencida deixa de bloquear sozinha. */
export function estaBloqueado(email, lista, agora = new Date()) {
  const registro = lista[String(email || '').trim().toLowerCase()];
  if (!registro) return false;
  if (!registro.ate) return true;
  return registro.ate > agora.toISOString().slice(0, 10);
}

/**
 * Adiciona (ou renova) um bloqueio. Nao rebaixa: endereco ja permanente nao
 * vira quarentena so porque apareceu um soft bounce depois.
 */
export function bloquear(lista, email, motivo, { agora = new Date(), origem = 'manual' } = {}) {
  const chave = String(email || '').trim().toLowerCase();
  if (!chave.includes('@')) return lista;

  const dias = QUARENTENA_DIAS[motivo] ?? 0;
  const ate = dias ? new Date(agora.getTime() + dias * 864e5).toISOString().slice(0, 10) : null;
  const atual = lista[chave];
  if (atual && !atual.ate) return lista; // permanente vence qualquer coisa

  lista[chave] = { motivo, desde: agora.toISOString().slice(0, 10), ate, origem };
  return lista;
}
