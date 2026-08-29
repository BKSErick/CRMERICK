import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatContractCurrency, type ContractDocumentSnapshot } from "./clientContracts.ts";

function longDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function partyLine(name: string, document: string, address: string, city: string, state: string) {
  return `${name}, inscrita no CNPJ/CPF sob o nº ${document}, com endereco em ${address}, ${city} - ${state}`;
}

function ensurePdfSpace(document: PDFKit.PDFDocument, requiredHeight: number) {
  const contentBottom = document.page.height - document.page.margins.bottom;
  if (document.y + requiredHeight > contentBottom) document.addPage();
}

export async function renderContractPdf(snapshot: ContractDocumentSnapshot, contractNumber: string): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margins: { top: 82, right: 56, bottom: 64, left: 56 }, bufferPages: true, info: {
    Title: `${contractNumber} - ${snapshot.title}`,
    Author: snapshot.provider.brandName,
    Subject: "Contrato de prestacao de servicos",
  } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const pageWidth = document.page.width;
  document.rect(0, 0, pageWidth, 58).fill("#111318");
  const logoPath = path.join(process.cwd(), "public", "brand", "mydrion-contract.png");
  document.image(readFileSync(logoPath), 56, 17, { width: 150 });
  document.fillColor("#F9D9B1").font("Helvetica-Bold").fontSize(8)
    .text(contractNumber, pageWidth - 190, 25, { width: 134, align: "right" });

  // O text do numero move o cursor para a coluna direita; devolva-o ao corpo A4.
  document.x = 56;
  document.y = 82;

  document.fillColor("#17191F").font("Helvetica-Bold").fontSize(16)
    .text("CONTRATO DE PRESTACAO DE SERVICOS", { align: "center" });
  document.moveDown(0.35).font("Helvetica").fontSize(10).fillColor("#555B66")
    .text(snapshot.title, { align: "center" });
  document.moveDown(1.4);

  document.fillColor("#242832").font("Helvetica").fontSize(9.5).lineGap(2);
  document.text(`CONTRATANTE: ${partyLine(snapshot.client.legalName, snapshot.client.document, snapshot.client.address, snapshot.client.city, snapshot.client.state)}, neste ato representada por ${snapshot.client.representativeName}, documento nº ${snapshot.client.representativeDocument}.`, { align: "justify" });
  document.moveDown(0.7);
  document.text(`CONTRATADA: ${partyLine(snapshot.provider.legalName, snapshot.provider.document, snapshot.provider.address, snapshot.provider.city, snapshot.provider.state)}, atuando sob a marca ${snapshot.provider.brandName}.`, { align: "justify" });
  document.moveDown(0.9);
  document.text("As partes resolvem firmar o presente Contrato de Prestacao de Servicos, regido pelas condicoes abaixo.", { align: "justify" });

  snapshot.sections.forEach((section, index) => {
    document.font("Helvetica").fontSize(9.3);
    const leadHeight = document.heightOfString(section.paragraphs[0] ?? "", {
      width: document.page.width - document.page.margins.left - document.page.margins.right,
      lineGap: 2,
    });
    ensurePdfSpace(document, Math.max(76, leadHeight + 42));
    document.moveDown(1);
    document.fillColor("#17191F").font("Helvetica-Bold").fontSize(10)
      .text(`${index + 1}. ${section.title}`);
    document.moveDown(0.35).fillColor("#303540").font("Helvetica").fontSize(9.3);
    section.paragraphs.forEach((paragraph) => {
      document.text(paragraph, { align: "justify", lineGap: 2 });
      document.moveDown(0.45);
    });
  });

  if (snapshot.notes) {
    ensurePdfSpace(document, 76);
    document.moveDown(0.8).fillColor("#17191F").font("Helvetica-Bold").fontSize(10).text("OBSERVACOES ESPECIFICAS");
    document.moveDown(0.35).fillColor("#303540").font("Helvetica").fontSize(9.3).text(snapshot.notes, { align: "justify", lineGap: 2 });
  }

  ensurePdfSpace(document, 120);
  document.moveDown(1.5).fillColor("#242832").font("Helvetica").fontSize(9.5)
    .text(`${snapshot.signingCity}, ${longDate(snapshot.signingDate)}.`, { align: "center" });
  document.moveDown(2.6);
  const signatureY = document.y;
  const left = 68;
  const width = 190;
  const right = pageWidth - 68 - width;
  document.moveTo(left, signatureY).lineTo(left + width, signatureY).strokeColor("#5B606A").stroke();
  document.moveTo(right, signatureY).lineTo(right + width, signatureY).stroke();
  document.font("Helvetica-Bold").fontSize(8.5).fillColor("#242832")
    .text(snapshot.provider.brandName, left, signatureY + 7, { width, align: "center" })
    .text(snapshot.client.representativeName, right, signatureY + 7, { width, align: "center" });
  document.font("Helvetica").fontSize(7.5).fillColor("#656B75")
    .text("CONTRATADA", left, signatureY + 20, { width, align: "center" })
    .text("CONTRATANTE", right, signatureY + 20, { width, align: "center" });

  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    const bottomMargin = document.page.margins.bottom;
    document.page.margins.bottom = 0;
    document.font("Helvetica").fontSize(7).fillColor("#7A808A")
      .text(`${contractNumber} · ${formatContractCurrency(snapshot.value)} · Pagina ${page + 1} de ${range.count}`, 56, document.page.height - 38, {
        width: document.page.width - 112,
        align: "center",
        lineBreak: false,
      });
    document.page.margins.bottom = bottomMargin;
  }
  document.end();
  return completed;
}
