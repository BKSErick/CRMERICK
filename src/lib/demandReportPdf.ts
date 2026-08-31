import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDemandCurrency, formatMonthKeyLabel } from "./clientDemands.ts";
import { formatCnpj, type Client } from "./clients.ts";
import { CONTRACT_PROVIDER, type ContractPartySnapshot } from "./contractProvider.ts";
import { type DemandReport } from "./demandReport.ts";

const PAGE_MARGINS = { top: 82, right: 56, bottom: 64, left: 56 };
const LEFT = PAGE_MARGINS.left;

/** Mesma paleta do contrato: os dois documentos saem da mesma marca. */
const INK = "#17191F";
const BODY = "#303540";
const MUTED = "#656B75";
const BAND = "#111318";
const ACCENT = "#F9D9B1";
const ZEBRA = "#F7F7F9";
const RULE = "#E2E4E9";

/**
 * Colunas da tabela, em pontos a partir da margem esquerda, com 6pt de goteira.
 * A ultima coluna precisa fechar exatamente em 539 (A4 menos as margens de 56), que e
 * onde as reguas e os totais terminam: sobrando, a tabela fica torta em relacao a eles.
 */
const COLUMNS = {
  demand: { x: LEFT, width: 196 },
  delivered: { x: LEFT + 202, width: 70 },
  month: { x: LEFT + 278, width: 62 },
  value: { x: LEFT + 346, width: 76 },
  payment: { x: LEFT + 428, width: 55 },
};

function shortDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(date);
}

function longToday(now: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" })
    .format(now);
}

function ensurePdfSpace(document: PDFKit.PDFDocument, requiredHeight: number) {
  const contentBottom = document.page.height - document.page.margins.bottom;
  if (document.y + requiredHeight > contentBottom) document.addPage();
}

/** Cabecalho da tabela. Repetido a cada pagina nova para a lista nunca ficar orfa. */
function drawTableHead(document: PDFKit.PDFDocument) {
  const top = document.y;
  document.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
  document.text("DEMANDA", COLUMNS.demand.x, top, { width: COLUMNS.demand.width, lineBreak: false });
  document.text("ENTREGUE", COLUMNS.delivered.x, top, { width: COLUMNS.delivered.width, lineBreak: false });
  document.text("COMPETENCIA", COLUMNS.month.x, top, { width: COLUMNS.month.width, lineBreak: false });
  document.text("VALOR", COLUMNS.value.x, top, { width: COLUMNS.value.width, align: "right", lineBreak: false });
  document.text("PAGAMENTO", COLUMNS.payment.x, top, { width: COLUMNS.payment.width, align: "right", lineBreak: false });
  const ruleY = top + 12;
  document.moveTo(LEFT, ruleY).lineTo(document.page.width - PAGE_MARGINS.right, ruleY).strokeColor(RULE).stroke();
  document.x = LEFT;
  document.y = ruleY + 7;
}

function totalRow(document: PDFKit.PDFDocument, label: string, value: number, strong: boolean) {
  const top = document.y;
  const right = document.page.width - PAGE_MARGINS.right;
  document.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11 : 9.5)
    .fillColor(strong ? INK : BODY);
  document.text(label, LEFT, top, { width: 300, lineBreak: false });
  document.text(formatDemandCurrency(value), right - 160, top, { width: 160, align: "right", lineBreak: false });
  document.x = LEFT;
  document.y = top + (strong ? 18 : 15);
}

export async function renderDemandReportPdf(
  report: DemandReport,
  client: Pick<Client, "name" | "legalName" | "cnpj" | "city" | "state">,
  provider: ContractPartySnapshot = CONTRACT_PROVIDER,
  now = new Date(),
): Promise<Buffer> {
  const title = `Relatorio de entregas - ${client.name}`;
  const document = new PDFDocument({
    size: "A4",
    margins: PAGE_MARGINS,
    bufferPages: true,
    info: { Title: title, Author: provider.brandName, Subject: `Entregas ${report.scopeLabel}` },
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const pageWidth = document.page.width;
  const contentWidth = pageWidth - PAGE_MARGINS.left - PAGE_MARGINS.right;

  document.rect(0, 0, pageWidth, 58).fill(BAND);
  const logoPath = path.join(process.cwd(), "public", "brand", "mydrion-contract.png");
  document.image(readFileSync(logoPath), LEFT, 17, { width: 150 });
  document.fillColor(ACCENT).font("Helvetica-Bold").fontSize(8)
    .text("RELATORIO DE ENTREGAS", pageWidth - 190, 25, { width: 134, align: "right" });

  // O text do rotulo move o cursor para a coluna direita; devolva-o ao corpo A4.
  document.x = LEFT;
  document.y = PAGE_MARGINS.top;

  document.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(client.name, { width: contentWidth });
  document.moveDown(0.3).font("Helvetica").fontSize(10).fillColor(MUTED)
    .text(`Entregas de ${report.scopeLabel}`, { width: contentWidth });
  document.moveDown(1.2);

  document.fillColor(BODY).font("Helvetica").fontSize(9).lineGap(2);
  if (client.legalName && client.legalName !== client.name) document.text(client.legalName);
  if (client.cnpj) document.text(`CNPJ ${formatCnpj(client.cnpj)}`);
  if (client.city) document.text(client.state ? `${client.city} - ${client.state}` : client.city);
  document.moveDown(0.6);
  document.fillColor(MUTED).fontSize(8.5)
    .text(`Emitido por ${provider.brandName} em ${longToday(now)} · ${report.totals.count} entrega(s)`);
  document.moveDown(1.4);

  drawTableHead(document);

  if (report.lines.length === 0) {
    document.font("Helvetica").fontSize(9.5).fillColor(MUTED)
      .text("Nenhuma entrega registrada neste periodo.", LEFT, document.y, { width: contentWidth });
    document.moveDown(1);
  }

  report.lines.forEach((line, index) => {
    document.font("Helvetica").fontSize(9);
    const titleHeight = document.heightOfString(line.demand.title, { width: COLUMNS.demand.width, lineGap: 1 });
    const rowHeight = Math.max(20, titleHeight + 9);

    const bottom = document.page.height - document.page.margins.bottom;
    if (document.y + rowHeight > bottom) {
      document.addPage();
      document.x = LEFT;
      document.y = PAGE_MARGINS.top;
      drawTableHead(document);
    }

    const top = document.y;
    if (index % 2 === 1) document.rect(LEFT - 6, top - 4, contentWidth + 12, rowHeight).fill(ZEBRA);

    document.fillColor(INK).font("Helvetica").fontSize(9)
      .text(line.demand.title, COLUMNS.demand.x, top, { width: COLUMNS.demand.width, lineGap: 1 });
    document.fillColor(BODY).fontSize(8.5);
    document.text(shortDate(line.demand.completedAt ?? line.demand.dueAt), COLUMNS.delivered.x, top + 1, { width: COLUMNS.delivered.width, lineBreak: false });
    document.text(line.billingMonth ? formatMonthKeyLabel(line.billingMonth) : "-", COLUMNS.month.x, top + 1, { width: COLUMNS.month.width, lineBreak: false });
    document.fillColor(INK).font("Helvetica-Bold").fontSize(9)
      .text(formatDemandCurrency(line.value), COLUMNS.value.x, top + 1, { width: COLUMNS.value.width, align: "right", lineBreak: false });
    document.font("Helvetica").fontSize(8.5).fillColor(line.isPaid ? "#1D7A4D" : "#8A5D00")
      .text(line.isPaid ? "Pago" : "Em aberto", COLUMNS.payment.x, top + 1, { width: COLUMNS.payment.width, align: "right", lineBreak: false });

    document.x = LEFT;
    document.y = top + rowHeight;
  });

  ensurePdfSpace(document, 110);
  document.moveDown(0.8);
  const totalsTop = document.y;
  document.moveTo(LEFT, totalsTop).lineTo(pageWidth - PAGE_MARGINS.right, totalsTop).strokeColor(RULE).stroke();
  document.x = LEFT;
  document.y = totalsTop + 12;

  totalRow(document, "Total entregue", report.totals.delivered, false);
  totalRow(document, "Ja pago", report.totals.paid, false);
  document.moveDown(0.2);
  totalRow(document, "A cobrar", report.totals.open, true);

  document.moveDown(1);
  document.font("Helvetica").fontSize(8).fillColor(MUTED)
    .text(`Duvidas sobre este relatorio: ${provider.email}`, LEFT, document.y, { width: contentWidth });

  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    const bottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document.font("Helvetica").fontSize(7).fillColor("#7A808A")
      .text(`${provider.brandName} · ${client.name} · ${report.scopeLabel} · Pagina ${page + 1} de ${range.count}`, LEFT, document.page.height - 38, {
        width: document.page.width - 112,
        align: "center",
        lineBreak: false,
      });
    document.page.margins.bottom = bottomMargin;
  }
  document.end();
  return completed;
}
