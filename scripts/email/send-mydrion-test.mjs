import {
  DEFAULT_MYDRION_EMAIL_FROM,
  createMydrionEmailServiceFromEnv,
} from '../../src/lib/mydrionEmail.mjs';

const args = process.argv.slice(2);

function readArg(name) {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
}

async function main() {
  const to = readArg('to');
  const shouldSend = args.includes('--send');
  const from = process.env.MYDRION_EMAIL_FROM || DEFAULT_MYDRION_EMAIL_FROM;

  if (!to) {
    throw new Error('Informe --to=<email> para o teste da Mydrion.');
  }

  const service = createMydrionEmailServiceFromEnv();
  const message = {
    from,
    to,
    subject: 'Primeiro email da Mydrion com Resend',
    html: '<p>Parabens! O envio transacional da <strong>Mydrion</strong> esta configurado.</p>',
  };

  service.prepare(message);

  if (!shouldSend) {
    console.log(`VALIDACAO OK: nenhum email enviado. Destinatario: ${to}`);
    console.log('Para enviar de verdade, repita com a flag --send.');
    return;
  }

  const result = await service.send(message);
  console.log(`Email enviado pelo Resend. ID: ${result.id}`);
}

main().catch((error) => {
  console.error(`Falha no teste Resend da Mydrion: ${error.message}`);
  process.exitCode = 1;
});
