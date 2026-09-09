var CRM_GMAIL_CONFIG = {
  initialLookbackDays: 30,
  overlapMinutes: 10,
  maximumThreads: 100,
  maximumMessagesPerRequest: 50,
  maximumBodyCharacters: 50000,
  maximumPayloadBytes: 900000,
};

function instalarSincronizacao() {
  propriedadesObrigatorias_();
  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === "sincronizarGmailComCrm";
    })
    .forEach(function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    });

  ScriptApp.newTrigger("sincronizarGmailComCrm")
    .timeBased()
    .everyMinutes(5)
    .create();

  sincronizarGmailComCrm();
}

function sincronizarGmailComCrm() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    var properties = propriedadesObrigatorias_();
    var lastSuccess = Number(properties.store.getProperty("CRM_LAST_SUCCESS_MS") || 0);
    var now = Date.now();
    var cutoff = lastSuccess
      ? lastSuccess - CRM_GMAIL_CONFIG.overlapMinutes * 60 * 1000
      : now - CRM_GMAIL_CONFIG.initialLookbackDays * 24 * 60 * 60 * 1000;
    var query = construirConsulta_(lastSuccess, properties.monitoredAddresses);
    var threads = GmailApp.search(query, 0, CRM_GMAIL_CONFIG.maximumThreads);
    var mailboxAddresses = enderecosDaCaixa_(properties.monitoredAddresses);
    var requests = 0;
    var messages = 0;

    threads.forEach(function (thread) {
      var pending = thread.getMessages()
        .filter(function (message) {
          return message.getDate().getTime() >= cutoff;
        })
        .map(function (message) {
          return mensagemParaPayload_(message, mailboxAddresses);
        });

      lotesParaEnvio_(thread, pending, mailboxAddresses).forEach(function (batch) {
        var payload = conversaParaPayload_(thread, batch, mailboxAddresses);
        publicarNoCrm_(properties.url, properties.secret, payload);
        requests += 1;
        messages += batch.length;
      });
    });

    properties.store.setProperty("CRM_LAST_SUCCESS_MS", String(now));
    console.log(JSON.stringify({ ok: true, threads: threads.length, requests: requests, messages: messages }));
  } finally {
    lock.releaseLock();
  }
}

function propriedadesObrigatorias_() {
  var store = PropertiesService.getScriptProperties();
  var url = String(store.getProperty("CRM_WEBHOOK_URL") || "").trim();
  var secret = String(store.getProperty("CRM_WEBHOOK_SECRET") || "").trim();
  var monitoredAddresses = String(store.getProperty("CRM_MAILBOX_ADDRESSES") || "")
    .split(",")
    .map(function (value) { return value.trim().toLowerCase(); })
    .filter(Boolean);

  if (!/^https:\/\//i.test(url)) throw new Error("CRM_WEBHOOK_URL deve usar HTTPS.");
  if (secret.length < 32) throw new Error("CRM_WEBHOOK_SECRET deve ter pelo menos 32 caracteres.");
  if (!monitoredAddresses.length) throw new Error("CRM_MAILBOX_ADDRESSES nao configurado.");
  return { store: store, url: url, secret: secret, monitoredAddresses: monitoredAddresses };
}

function construirConsulta_(lastSuccess, monitoredAddresses) {
  var addressTerms = [];
  monitoredAddresses.forEach(function (address) {
    addressTerms.push("to:" + address);
    addressTerms.push("from:" + address);
  });
  var period = "newer_than:30d";
  if (lastSuccess) {
    var date = new Date(lastSuccess - 24 * 60 * 60 * 1000);
    period = "after:" + Utilities.formatDate(date, "GMT", "yyyy/MM/dd");
  }
  return "in:anywhere " + period + " {" + addressTerms.join(" ") + "}";
}

function enderecosDaCaixa_(monitoredAddresses) {
  var addresses = monitoredAddresses.slice();
  var account = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  if (account) addresses.push(account);
  GmailApp.getAliases().forEach(function (alias) {
    addresses.push(String(alias).trim().toLowerCase());
  });
  return Array.from(new Set(addresses));
}

function mensagemParaPayload_(message, mailboxAddresses) {
  var from = caixaPostal_(message.getFrom());
  var direction = mailboxAddresses.indexOf(from.email) >= 0 ? "sent" : "received";
  return {
    id: message.getId(),
    direction: direction,
    text: String(message.getPlainBody() || "").slice(0, CRM_GMAIL_CONFIG.maximumBodyCharacters),
    subject: String(message.getSubject() || "").slice(0, 500),
    from: from,
    to: listaCaixasPostais_(message.getTo()),
    cc: listaCaixasPostais_(message.getCc()),
    bcc: listaCaixasPostais_(message.getBcc()),
    replyToEmail: caixaPostal_(message.getReplyTo()).email,
    sourceMessageId: String(message.getHeader("Message-ID") || "").slice(0, 998),
    occurredAt: message.getDate().getTime(),
    attachments: [],
  };
}

function conversaParaPayload_(thread, messages, mailboxAddresses) {
  var received = messages.find(function (message) { return message.direction === "received"; });
  var sent = messages.find(function (message) { return message.direction === "sent"; });
  var participant = received && received.from;
  if (!participant && sent) {
    participant = sent.to.find(function (mailbox) {
      return mailboxAddresses.indexOf(mailbox.email) < 0;
    });
  }
  if (!participant || !participant.email) throw new Error("Nao foi possivel identificar o participante externo.");

  return {
    source: "gmail_apps_script",
    thread: {
      id: thread.getId(),
      participantEmail: participant.email,
      participantName: participant.name || participant.email,
      subject: messages[messages.length - 1].subject || "Sem assunto",
    },
    messages: messages,
  };
}

function caixaPostal_(value) {
  var source = String(value || "").trim();
  var emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  var email = emails.length ? emails[emails.length - 1].toLowerCase() : "";
  var name = source.replace(/<[^>]+>/g, "").replace(/^"|"$/g, "").trim();
  return { name: name === email ? "" : name.slice(0, 200), email: email };
}

function listaCaixasPostais_(value) {
  var matches = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  return matches.slice(0, 50).map(function (email) {
    return { name: "", email: email.toLowerCase() };
  });
}

function lotesParaEnvio_(thread, messages, mailboxAddresses) {
  var batches = [];
  var current = [];

  messages.forEach(function (message) {
    var candidate = current.concat([message]);
    var payload = conversaParaPayload_(thread, candidate, mailboxAddresses);
    var payloadBytes = Utilities.newBlob(JSON.stringify(payload)).getBytes().length;
    var exceedsCount = candidate.length > CRM_GMAIL_CONFIG.maximumMessagesPerRequest;
    var exceedsBytes = payloadBytes > CRM_GMAIL_CONFIG.maximumPayloadBytes;

    if (!exceedsCount && !exceedsBytes) {
      current = candidate;
      return;
    }
    if (!current.length) throw new Error("Uma mensagem excede o limite seguro do CRM.");

    batches.push(current);
    current = [message];
    payload = conversaParaPayload_(thread, current, mailboxAddresses);
    payloadBytes = Utilities.newBlob(JSON.stringify(payload)).getBytes().length;
    if (payloadBytes > CRM_GMAIL_CONFIG.maximumPayloadBytes) {
      throw new Error("Uma mensagem excede o limite seguro do CRM.");
    }
  });

  if (current.length) batches.push(current);
  return batches;
}

function publicarNoCrm_(url, secret, payload) {
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("CRM recusou a sincronizacao com HTTP " + status + ".");
  }
}
