# Graph Report - CRM ERICK  (2026-09-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3152 nodes · 6012 edges · 247 communities (168 shown, 48 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 152 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a561ee4a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 178
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 187
- Community 188
- Community 197
- Community 198
- Community 199
- Community 201
- Community 202
- Community 203
- Community 204
- Community 206
- Community 210
- Community 212
- Community 214
- Community 216
- Community 218
- Community 220
- Community 222
- Community 224
- Community 226
- Community 227
- Community 229
- Community 231
- Community 232
- Community 233
- Community 235
- Community 236
- Community 238
- Community 239
- Community 240
- Community 242
- Community 243
- Community 244

## God Nodes (most connected - your core abstractions)
1. `getCrmSupabaseAdmin()` - 137 edges
2. `requireDemandAdminSession()` - 56 edges
3. `demandId()` - 49 edges
4. `demandErrorResponse()` - 43 edges
5. `scripts` - 42 edges
6. `DemandWorkspace()` - 31 edges
7. `DemandasPage()` - 28 edges
8. `mapClientDemand()` - 25 edges
9. `mapDealFromRow()` - 23 edges
10. `appendDemandEvent()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `carregarNaoProspectar()` --indirect_call--> `normalize()`  [INFERRED]
  scripts/lib/leadIngest.js → src/lib/leadScoring.js
- `carregarFila()` --calls--> `copyAssignmentForLead()`  [EXTRACTED]
  scripts/uazapi-send-batch.mjs → src/lib/salesPlaybook.mjs
- `classificarComIA()` --calls--> `describeFailures()`  [EXTRACTED]
  scripts/classify-conversations.mjs → src/lib/aiProviders.mjs
- `contextFor()` --calls--> `buildCopilotContext()`  [EXTRACTED]
  tests/sales-copilot.test.ts → src/lib/salesCopilot.mjs
- `classify()` --calls--> `classificationUpdate()`  [EXTRACTED]
  scripts/followup-ops.mjs → src/lib/followup.ts

## Import Cycles
- None detected.

## Communities (247 total, 48 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (107): Amostra, contar(), GET(), media(), runtime, Segmento, taxaSuavizada(), dynamic (+99 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (76): currentMonth(), flagValue(), getSupabase(), main(), parseDealLossArgs(), validDate(), DELETE(), errorResponse() (+68 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (70): catalog, manifest, manifestPath, root, AgentChatWorkspace(), newConversation(), openConversation(), removeConversation() (+62 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (55): currentMonthPeriod(), flagValue(), getSupabase(), main(), parseDealForecastArgs(), STAGES, validDateArg(), envFile (+47 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (55): loadClientOrThrow(), PATCH(), persistRepresentative(), POST(), runtime, ClientContracts(), changeStatus(), merge() (+47 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (44): POST(), Filter, parseFilter(), POST(), runtime, STAGES, BriefLead, cleanPhone() (+36 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (38): browserDiagnostics, openPage(), pending, sleep(), socket, openPage(), patchRequests, pending (+30 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (35): MOSTRAR_TODOS, POST(), aiModelCatalog, CATALOG_SOURCES, catalogCache, conjunto(), deadModels, discoverFreeModels() (+27 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (37): DealWorkspace(), DealWorkspaceProps, DemandDialog(), DemandDialogOption, DemandDialogProps, DemandDialogState, billingHint(), bodyJson() (+29 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (42): scripts, ai:dna:check, ai:dna:sync, ai:doctor, automation:commercial, build, content:seed, content:seed:dry (+34 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (36): client_contracts_updated_at, client_demand_checklist_updated_at, client_demand_links_updated_at, client_demands_updated_at, commercial_automation_rules_updated_at, contacts_updated_at, deals_updated_at, demand_folders_updated_at (+28 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (40): asNullableString(), asNumber(), asRecord(), asString(), BRL, buildDemandOverview(), compareCompletedDemands(), compareDemands() (+32 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (34): fetchAllPages(), { avaliarLead, carregarAprovados }, canalDoContato(), carregarFila(), carregarOptOuts(), dealsNaoProspect(), DIA_INTEIRO, DIA_MAX_S (+26 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (33): ACTIVE_STAGES, flagValue(), getSupabase(), listDeals(), main(), parseDealQualificationArgs(), QualificationEditor(), mutateQualification() (+25 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (32): clientErrorResponse(), cnpjColumn(), GET(), monthParam(), PATCH(), POST(), runtime, TEXT_FIELDS (+24 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (28): pagamentoLabel(), BillableDemand, buildInstallments(), chargesInMonth(), ClientDemand, demandBilledTotal(), demandBillingMonth(), demandBillsInMonth() (+20 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (22): nomeCurto(), abertura(), aberturaLocal(), arquivos, CASE_LOCAL, CASE_POR_SEGMENTO, detalheDaFriccao(), detectarSegmento() (+14 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (27): DEMAND_DRAG_TYPE, DemandTreeProps, FOLDER_DRAG_TYPE, DemandPriority, ALL_NODE_KEY, asNumber(), asRecord(), asString() (+19 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (30): ClientesPage(), EMPTY_FORM, responseJson(), bodyJson(), ClientWorkspace(), save(), ClientWorkspaceProps, competenciaLabel() (+22 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (29): DELETE(), dynamic, PATCH(), RouteContext, runtime, maxDuration, POST(), publishThreads() (+21 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (24): explanation(), flagValue(), getSupabase(), listActiveDealIds(), main(), parseDealHealthArgs(), ACTIVE_STAGES, addEvidence() (+16 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (28): activityDescription(), ContactRef, DealRef, enrichWithAi(), fallbackContactName(), findOrCreateContact(), findOrCreateDeal(), jsonError() (+20 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (29): ACTIVE_STAGES, asIso(), asNumberOrNull(), assertCopilotSuggestion(), buildCopilotContext(), contextShell(), COPILOT_BRIEFING_QUESTIONS, COPILOT_FORBIDDEN_EFFECTS (+21 more)

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (28): cleanInbound(), cleanPhone(), FUNDO_LABEL, GET(), PATCH(), runtime, startOfToday(), CASE_LINK (+20 more)

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (27): flagValue(), getSupabase(), main(), parseSalesCopilotArgs(), QUESTION_KEYS, runSalesCopilotCli(), validDateArg(), buildCopilotAnswer() (+19 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (19): DataStatus, DealListPage(), dealOwner(), formatDate(), nextActionTone(), sortOptions, Deal, DealListFilters (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (24): AMOSTRA, db, ESTAGIOS_PROTEGIDOS, GO, RAIZ, SO_FORA, ANTI_ICP, ANTI_ICP_FRACO (+16 more)

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (25): cleanPhone(), cleanSiteUrl(), { createClient }, dedupeBy(), DISPARO_PATH, DRY_RUN, env, FORCE (+17 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (20): GET(), POST(), POST(), POST(), GET(), GET(), buildAuthorizeUrl(), exchangeCodeForToken() (+12 more)

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (17): metadata, ModulePage(), ModulePageProps, ModulePlaceholder(), ModulePlaceholderProps, caminhoDaRequisicao(), JA_INSTALADO, SessionWatcher() (+9 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (20): afternoonFirst, afternoonFollowups, alvoPorSlot, arg(), blocoPorSlot, createdAt, date, firstPorSlot (+12 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (21): AUTORESPONDER, carregarFila(), EXCLUDE_IDS, FORCE_HORA, GO, hhmm(), IDS, janelaOk() (+13 more)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (23): Form, formFrom(), Props, toDatetimeLocal(), acceptsCaption(), allowedMediaKinds(), assertPublishable(), captionLimitFor() (+15 more)

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (19): cleanPhone(), DisparoPage(), guardCompanyMessage(), handleClassification(), phoneFor(), whatsappLink(), WhatsappSummary, logWhatsappOpened() (+11 more)

### Community 35 - "Community 35"
Cohesion: 0.21
Nodes (24): BUILDER_URL_PATTERNS, classifySegment(), consciousnessV2(), DDDS_VALIDOS, dedupeLeads(), detectBuilderByUrl(), diagnoseLead(), EXCLUDE_TERMS (+16 more)

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (17): args, batch, BH, budget, CHECK, DAILY_CAP, envAIOS, envCRM (+9 more)

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (22): DemoJson, GET(), jsonError(), parseBreakdown(), ContentMetrics, PublishedMediaInput, fetchMediaMetrics(), fetchPermalink() (+14 more)

### Community 38 - "Community 38"
Cohesion: 0.09
Nodes (17): approval, approvalFile, carimbo(), confirmacao, date, DIR, dispatchLog, fd (+9 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (20): buscarTudo(), carregarNaoProspectar(), { diagnoseLead, normalize }, digitos(), dominio(), DOMINIOS_GENERICOS, ehProibido(), { fetchLeadHtml, analyzeHtml } (+12 more)

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (21): DemandDeliveredReport(), DemandDeliveredReportProps, shortDate(), clientTag(), DemandGroup(), DemandOverview(), DemandOverviewProps, DemandRows() (+13 more)

### Community 41 - "Community 41"
Cohesion: 0.17
Nodes (20): FollowupTier, ProspectingVertical, copyPersonalization(), createDeal(), getProspectingQueue(), ImportCandidate, importInstagramProspect(), loadSuppressionList() (+12 more)

### Community 42 - "Community 42"
Cohesion: 0.09
Nodes (16): CHAVES, CIDADE, cnpjEnrich, crm, g, GARIMPO_ENV, GO, ingest (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.13
Nodes (17): date, DIR, requestedSlot, ROOT, canonicalManifest(), createProspectingApproval(), cumulativeTargetForSlot(), LEASE_MAX_MINUTES (+9 more)

### Community 44 - "Community 44"
Cohesion: 0.16
Nodes (19): DemandasPage(), clientIdForSelection(), createDemand(), createFolder(), deleteDemands(), deleteFolder(), folderPathLabel(), moveDemands() (+11 more)

### Community 45 - "Community 45"
Cohesion: 0.16
Nodes (17): DealCard(), DealCardProps, originLabel(), tagTypeMeta, DealDetailOverlayProps, LossReasonDialog(), QualificationMutation, activityInitials() (+9 more)

### Community 46 - "Community 46"
Cohesion: 0.10
Nodes (15): CHAVES, CIDADE, cnpjEnrich, crm, g, GARIMPO_ENV, GO, HUB (+7 more)

### Community 47 - "Community 47"
Cohesion: 0.24
Nodes (19): api(), classifyStage(), firstLine(), fmtCompact(), fmtPercent(), fmtPtInt(), mapMedia(), mediaInsight() (+11 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (17): Alerts, APPROACH_LABELS, Comando, ComandoPage(), handleFollowup(), handleWhatsapp(), CommandForecast, FollowupItem (+9 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (13): AutomationRule, boolToStorage(), ConfiguracoesPage(), saveConfig(), PreferenceToggleProps, readLocalConfig(), SECTIONS, storageToBool() (+5 more)

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (15): Activity, activityLabel, Contact360, ContactsPage(), ContactStatus, DealLite, fmtDate(), initials() (+7 more)

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (16): BriefEvent, Briefing, BriefLead, buildCharts(), compactCurrency(), currencyFormatter, FUNNEL_STAGES, Home() (+8 more)

### Community 52 - "Community 52"
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+11 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (14): comCanal, comTelefone, comWhats, linhas, MD, nuncaTocado, porIdContato, RAIZ (+6 more)

### Community 54 - "Community 54"
Cohesion: 0.23
Nodes (17): flagValue(), getSupabase(), main(), parseAutomationArgs(), parsePayload(), printSummary(), stableEventId(), createCommercialEvent() (+9 more)

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (18): analyzeHtml(), BUILDER_HTML_FINGERPRINTS, CACHE_DIR, cacheFile(), COMPETITOR_PATTERNS, computeContentScore(), { detectBuilderByUrl, classifyPhone }, detectBuilderFromHtml() (+10 more)

### Community 56 - "Community 56"
Cohesion: 0.11
Nodes (16): dbContent, files, fs, htmlFiles, mergedContacts, mergedDeals, newDbContent, originalContacts (+8 more)

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (11): clean(), ContentBoard(), formatDate(), nf, rowText(), CONTENT_PAGE_SIZE, CONTENT_STATUSES, contentTimestamp() (+3 more)

### Community 58 - "Community 58"
Cohesion: 0.12
Nodes (17): next, dependencies, next, pdfkit, pg, react, react-dom, resend (+9 more)

### Community 59 - "Community 59"
Cohesion: 0.13
Nodes (15): COMPARE, COMPARE_N, DATA_CANDIDATES, ENRICH, ENRICH_LIMIT, { fetchLeadHtml, analyzeHtml }, fs, { HIGH_INTENT_QUERIES, dedupeLeads, diagnoseLead } (+7 more)

### Community 60 - "Community 60"
Cohesion: 0.17
Nodes (15): acquireLock(), AUDIT_FILE, buildRunPlan(), flagValue(), HEARTBEAT_FILE, LOCK_FILE, LOG_DIR, main() (+7 more)

### Community 61 - "Community 61"
Cohesion: 0.21
Nodes (15): EMPTY_METRICS, EVENT_MAP, GET(), Metrics, base64url(), fetchGaEvents(), fetchGaPages(), GaEventRow (+7 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (14): CalendarPage(), closeForm(), openCreate(), openEdit(), submit(), CalEvent, DealLite, fmtDay() (+6 more)

### Community 63 - "Community 63"
Cohesion: 0.13
Nodes (14): suggestAction(), CLASSIFICATION_COLORS, CLASSIFICATION_LABELS, CopilotAnswer, CopilotAnswerBody(), saveToAchados(), CopilotAnswerBodyProps, CopilotPanel() (+6 more)

### Community 64 - "Community 64"
Cohesion: 0.12
Nodes (13): CIDADE, crm, g, garimpo, GARIMPO_ENV, GO, ingest, LIMITE (+5 more)

### Community 65 - "Community 65"
Cohesion: 0.20
Nodes (12): ACTION_TYPES, actionGuard(), COMMERCIAL_AUTOMATION_CONTRACT_VERSION, commercialAutomation, CONDITION_OPERATORS, conditionMatches(), evaluateCommercialEvent(), EVENT_TYPES (+4 more)

### Community 66 - "Community 66"
Cohesion: 0.12
Nodes (15): CopilotAiStatus, CopilotAiTrail, CopilotAnswer, CopilotContext, CopilotDraftSuggestion, CopilotEvidence, CopilotFact, CopilotItem (+7 more)

### Community 67 - "Community 67"
Cohesion: 0.28
Nodes (14): api(), badge(), fetchMedia(), firstLine(), fmt(), mapMedia(), mediaInsight(), mediaTag() (+6 more)

### Community 68 - "Community 68"
Cohesion: 0.13
Nodes (10): db, FILTRO, linhas, MD, NOME_BLOCKER, NOME_CONSCIENCIA, NOME_SOFISTICACAO, RAIZ (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (12): contactsByCompany, contactsByName, { deals, contacts }, digits(), EXPORT_CSV, fs, MOCK_DB_PATH, normalizePhone() (+4 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (9): carteira, clientDesc(), copies, CRM_DIR, ERICK_DIR, frontmatterDesc(), OUT_DIR, read() (+1 more)

### Community 71 - "Community 71"
Cohesion: 0.13
Nodes (10): ForecastState, FunilPage(), FunnelSource, InstagramState, numberFormatter, OperationalFunnelState, PixelState, stageLabels (+2 more)

### Community 72 - "Community 72"
Cohesion: 0.16
Nodes (8): MeuPost, ThreadsPanel(), Topico, nf, ThreadsPayload, ThreadsPost, ThreadsSubnav(), threadsTabs

### Community 73 - "Community 73"
Cohesion: 0.24
Nodes (12): DemandTree(), accepts(), beginDrag(), createSubfolder(), folderIcon(), handleDragOver(), handleDrop(), openMenu() (+4 more)

### Community 74 - "Community 74"
Cohesion: 0.26
Nodes (10): args, main(), readArg(), createMydrionEmailService(), prepare(), createMydrionEmailServiceFromEnv(), DEFAULT_MYDRION_EMAIL_FROM, extractEmail() (+2 more)

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (8): ESTAGIO_QUENTE, GO, MIN_AMOSTRA, PESO_PRIOR, RAIZ, SAIDA, taxaSuavizada(), taxaSuavizada()

### Community 76 - "Community 76"
Cohesion: 0.25
Nodes (12): GET(), runtime, businessDays(), computeNorthStar(), DEFAULT_GOALS, Goals, keyToIndex(), loadGoals() (+4 more)

### Community 77 - "Community 77"
Cohesion: 0.22
Nodes (12): addUtcDays(), buildSearchQueries(), ChannelEvent, ChannelHistory, cleanLocationPart(), INSTAGRAM_RESERVED_PATHS, InstagramKanbanColumn, instagramKanbanColumnForStatus() (+4 more)

### Community 78 - "Community 78"
Cohesion: 0.26
Nodes (12): chaveTelefone(), ehSombra(), EXCLUIR_DEALS, flagValue(), getSupabase(), main(), normalizeWhatsappPhone(), phoneMatchVariants() (+4 more)

### Community 79 - "Community 79"
Cohesion: 0.18
Nodes (10): classificarComIA(), db, evidenciaVemDoLead(), extrairJson(), GO, LIMITE, normalizar(), RAIZ (+2 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (9): CHAVES, cnpjEnrich, crm, { diagnoseLead, normalize }, g, GO, ingest, RAIZ (+1 more)

### Community 81 - "Community 81"
Cohesion: 0.22
Nodes (12): db, extrairContatoIndicado(), fold(), GO, limpaToken(), mensagemDecisorIndicado(), MENSAGENS, { nomeCurto } (+4 more)

### Community 82 - "Community 82"
Cohesion: 0.15
Nodes (10): CIDADE, crm, FORCE, { gerarCopy, ehSiteProprio, MINIMO_AVALIACOES }, GO, ingest, LIMITE, { normalize } (+2 more)

### Community 83 - "Community 83"
Cohesion: 0.33
Nodes (12): CACHE_DIR, digitos(), extractCnpjsFromText(), fetchCnpjMinhaReceita(), formatarCnpj(), fs, normalizarPorte(), path (+4 more)

### Community 84 - "Community 84"
Cohesion: 0.23
Nodes (11): client_demand_checklist_updated_at, client_demand_links_updated_at, client_demands_updated_at, public.client_demand_attachments, public.client_demand_checklist_items, public.client_demand_events, public.client_demand_links, public.client_demands (+3 more)

### Community 85 - "Community 85"
Cohesion: 0.17
Nodes (11): assertContains(), BUILD_SCRIPT, buildSource, fail(), fs, path, PIXEL_SCRIPT, pixelSource (+3 more)

### Community 86 - "Community 86"
Cohesion: 0.21
Nodes (9): ContentEditorDialog(), handleDelete(), handlePublish(), handleSave(), save(), emptyForm(), fileLabel(), readBody() (+1 more)

### Community 87 - "Community 87"
Cohesion: 0.19
Nodes (11): NextActionType, ResponseType, ChannelStatus, ProspectingChannel, ActionInput, ChannelUpdate, nextCadence(), PlannedMessage (+3 more)

### Community 88 - "Community 88"
Cohesion: 0.26
Nodes (11): ResponseTypeSource, asChannel(), asNullableString(), asNumber(), asResponseType(), asStatus(), mapProspectingChannelFromRow(), mapProspectingChannelToRow() (+3 more)

### Community 89 - "Community 89"
Cohesion: 0.18
Nodes (9): alvos, buscarTudo(), GO, LIMITE, lote, porId, porMotivo, RAIZ (+1 more)

### Community 90 - "Community 90"
Cohesion: 0.17
Nodes (6): CONCORRENCIA, GO, LIMITE, PAGINAS, RAIZ, SO_SEM_CELULAR

### Community 91 - "Community 91"
Cohesion: 0.20
Nodes (11): Amostra, AnalisePage(), BLOCKER, CONSCIENCIA, DEMANDA, Escala(), nota(), Payload (+3 more)

### Community 92 - "Community 92"
Cohesion: 0.18
Nodes (8): Brandbook, BrandbookPage(), Card, Column, Hero, ListItem, loadBrandbook(), Section

### Community 93 - "Community 93"
Cohesion: 0.18
Nodes (4): DealDetailOverlay(), handleGenerateInsight(), handleResponseType(), loadInsights()

### Community 94 - "Community 94"
Cohesion: 0.17
Nodes (10): carteira, css, demandsPage, demandsRoute, demandWorkspace, nav, overview, page (+2 more)

### Community 95 - "Community 95"
Cohesion: 0.20
Nodes (8): dealByCompany, env, H, norm(), prev, queue, seen, uniq

### Community 96 - "Community 96"
Cohesion: 0.35
Nodes (10): audit(), classify(), getClient(), listQueue(), main(), option(), RESPONSE_TYPES, schedule() (+2 more)

### Community 97 - "Community 97"
Cohesion: 0.18
Nodes (8): ARQUIVO, crm, GO, ingest, { isExcluded }, RAIZ, require, SEM_ENRICH

### Community 98 - "Community 98"
Cohesion: 0.18
Nodes (6): CANDIDATAS, GO, LIMITE, LOTE, RAIZ, SO_FIXO

### Community 99 - "Community 99"
Cohesion: 0.31
Nodes (10): followupMessage(), copyAssignmentForLead(), detectVariantFromCopy(), foldText(), interpolate(), isLocal(), renderFollowupMessage(), segmentDescription() (+2 more)

### Community 100 - "Community 100"
Cohesion: 0.24
Nodes (6): InstagramSubnav(), instagramTabs, ListaSubnav(), listaTabs, Subnav(), SubnavTab

### Community 101 - "Community 101"
Cohesion: 0.38
Nodes (10): normalizeInstagramIdentity(), rankInstagramEvidence(), existingReferences(), extractInstagramFromHtml(), fold(), instagramFromOfficialWebsite(), OrganicResult, Place (+2 more)

### Community 102 - "Community 102"
Cohesion: 0.18
Nodes (10): css, dealWorkspace, deliveredReport, dialog, nav, overview, page, reportRoute (+2 more)

### Community 103 - "Community 103"
Cohesion: 0.20
Nodes (7): APPLY, args, client, connectionString, env, sql, sqlPath

### Community 104 - "Community 104"
Cohesion: 0.29
Nodes (9): buildOstrackCtaUrl(), buildTrackingSnippet(), copyDiagnosticsWithTracking(), createOstrackCtaBlock(), diagnosticsSourceDir, diagnosticsTargetDir, fs, injectOstrackCta() (+1 more)

### Community 105 - "Community 105"
Cohesion: 0.38
Nodes (9): fetchRows(), fs, inspectSource(), loadEnv(), main(), migrateBatch(), path, queryProject() (+1 more)

### Community 106 - "Community 106"
Cohesion: 0.31
Nodes (9): demand_folders_updated_at, demand_lists_updated_at, demand_spaces_updated_at, public.demand_folders, public.demand_lists, public.demand_spaces, public, public.deals (+1 more)

### Community 107 - "Community 107"
Cohesion: 0.22
Nodes (8): buscarTudo(), devolver, GO, manter, porId, porMotivo, RAIZ, supa()

### Community 108 - "Community 108"
Cohesion: 0.22
Nodes (9): GaPage, GaState, nf, PageStat, Payload, Signal, SinaisPage(), timeAgo() (+1 more)

### Community 109 - "Community 109"
Cohesion: 0.22
Nodes (7): COPILOT_SUGGESTION_KINDS, copilotUserPrompt(), minimizeCopilotContext(), SALES_COPILOT_CONTRACT_VERSION, DEALS, LOSS_RECORDS, PERIOD

### Community 110 - "Community 110"
Cohesion: 0.22
Nodes (8): description, name, overrides, brace-expansion, minimatch, postcss, sharp, version

### Community 111 - "Community 111"
Cohesion: 0.25
Nodes (7): public.materialize_quiz_lead_deal, public.set_quiz_leads_updated_at, public.materialize_quiz_lead_deal(), public.quiz_leads, quiz_leads_materialize_deal, quiz_leads_set_updated_at, public.deals

### Community 112 - "Community 112"
Cohesion: 0.22
Nodes (8): body, fs, https, options, path, req, SCHEMA_FILE, sql

### Community 113 - "Community 113"
Cohesion: 0.22
Nodes (8): backupDir, backupPath, byStatus, dealIds, go, rows, stamp, supabase

### Community 114 - "Community 114"
Cohesion: 0.28
Nodes (8): CRM_ROOT, DEFINITIONS, manifest, personas, publicItems, sha256(), sourceFor(), syncedAt

### Community 115 - "Community 115"
Cohesion: 0.33
Nodes (8): ActivityRow, errorResponse(), GET(), POST(), runtime, buildWhatsappActivitySummary(), cleanWhatsappActivityDescription(), normalizeClientActivityType()

### Community 116 - "Community 116"
Cohesion: 0.31
Nodes (8): COPILOT_ACTIONS, COPILOT_WRITE_ACTIONS, handleCopilotAction(), resolveOperator(), runtime, COPILOT_QUESTIONS, applyCopilotSuggestion(), saveCopilotLearning()

### Community 117 - "Community 117"
Cohesion: 0.31
Nodes (7): maxDuration, POST(), runtime, mimeTypeFromFilename(), transcribeAudio(), TranscribeOptions, TranscribeResult

### Community 118 - "Community 118"
Cohesion: 0.33
Nodes (8): configuredMaxBytes(), POST(), runtime, CONTENT_MEDIA_BUCKET, contentStoragePath(), DEFAULT_MAX_CONTENT_MEDIA_BYTES, isContentChannel(), mediaKindFromMime()

### Community 119 - "Community 119"
Cohesion: 0.25
Nodes (6): firstLine(), GENDER_LABELS, InstagramMedia, InstagramPage(), InstagramPayload, numberFormatter

### Community 120 - "Community 120"
Cohesion: 0.22
Nodes (8): Assumptions, BRL, CHANNELS, emptyForm, Experiment, FUNNEL_STEPS, NorthStarLite, STATUSES

### Community 121 - "Community 121"
Cohesion: 0.22
Nodes (5): MydrionEmailMessage, MydrionEmailService, MydrionResendClient, PreparedMydrionEmail, ResendSendResult

### Community 122 - "Community 122"
Cohesion: 0.25
Nodes (7): destination, dryRun, endpoint, missing, payload, secretHash, supabase

### Community 123 - "Community 123"
Cohesion: 0.25
Nodes (7): fs, html, path, source, styleBlocks, target, targetDir

### Community 124 - "Community 124"
Cohesion: 0.29
Nodes (7): alteracoes, buscarTudosDeals(), GO, HOJE_ISO, HOJE_ZERO, RAIZ, supa()

### Community 125 - "Community 125"
Cohesion: 0.25
Nodes (7): byChannel, dryRun, jsonPath, ordinals, plan, rows, supabase

### Community 127 - "Community 127"
Cohesion: 0.29
Nodes (6): BRL, monthLabel(), NorthStar, NorthStarPage(), STAGE_LABELS, WonDeal

### Community 128 - "Community 128"
Cohesion: 0.25
Nodes (7): CommercialAction, CommercialActionType, CommercialCondition, CommercialDecision, CommercialEvent, CommercialEventType, CommercialRule

### Community 129 - "Community 129"
Cohesion: 0.25
Nodes (7): LeadDiagnosis, LeadInput, PhoneKind, PhoneProfile, PhoneSource, WinningCell, WinningProfile

### Community 130 - "Community 130"
Cohesion: 0.61
Nodes (6): asNullableString(), asTrimmedString(), parseImportRequest(), parseSearchRequest(), parseVertical(), safePublicHttpUrl()

### Community 131 - "Community 131"
Cohesion: 0.36
Nodes (5): createSerperClient(), parseSerperKeys(), serper, SerperRequest, SerperResponse

### Community 132 - "Community 132"
Cohesion: 0.25
Nodes (7): css, nav, normalizedPage, overlay, page, pipeline, sidebar

### Community 133 - "Community 133"
Cohesion: 0.29
Nodes (7): css, navigation, pages, read(), sidebar, subnav, subnavBase

### Community 134 - "Community 134"
Cohesion: 0.29
Nodes (6): dryRun, env, envPath, files, label, sourceSql

### Community 135 - "Community 135"
Cohesion: 0.43
Nodes (6): commercial_automation_rules_updated_at, public.commercial_automation_rules, public.commercial_automation_runs, public.commercial_events, public.deals, public.set_updated_at

### Community 136 - "Community 136"
Cohesion: 0.29
Nodes (5): client_contracts_updated_at, public.client_contract_number_counters, public.client_contracts, public.clients, public.set_client_demand_updated_at

### Community 137 - "Community 137"
Cohesion: 0.29
Nodes (5): fs, LEADS_DIR, MOCK_DB_PATH, path, vm

### Community 139 - "Community 139"
Cohesion: 0.33
Nodes (5): Insight, NEW_TYPES, TYPES, FunnelSubnav(), funnelTabs

### Community 140 - "Community 140"
Cohesion: 0.38
Nodes (4): LoginForm(), login(), readJson(), metadata

### Community 141 - "Community 141"
Cohesion: 0.29
Nodes (6): DealQualification, QualificationEvidence, QualificationField, QualificationFieldKey, QualificationFieldStatus, QualificationSummary

### Community 142 - "Community 142"
Cohesion: 0.40
Nodes (4): public.ai_conversation_messages, public.ai_conversations, public.touch_ai_conversation_updated_at, trg_ai_messages_touch_conversation

### Community 143 - "Community 143"
Cohesion: 0.40
Nodes (5): demand_folders_updated_at, public.demand_folders, public, public.deals, public.set_client_demand_updated_at

### Community 144 - "Community 144"
Cohesion: 0.47
Nodes (4): LabPage(), handleDelete(), handleSubmit(), loadExperiments()

### Community 146 - "Community 146"
Cohesion: 0.40
Nodes (4): CalEvent, fmtFull(), ReunioesPage(), STATUS_LABELS

### Community 147 - "Community 147"
Cohesion: 0.33
Nodes (5): LossAnalysis, LossDistributionItem, LossHistoryRecord, LossReasonCode, LossReasonInput

### Community 148 - "Community 148"
Cohesion: 0.40
Nodes (4): count, generatedAt, items, schemaVersion

### Community 149 - "Community 149"
Cohesion: 0.40
Nodes (3): public.set_content_item_updated_at, content_items_updated_at, public.content_items

### Community 150 - "Community 150"
Cohesion: 0.40
Nodes (4): { Client }, fs, path, SCHEMA_PATH

### Community 151 - "Community 151"
Cohesion: 0.40
Nodes (3): asJson, root, typeArgIndex

### Community 153 - "Community 153"
Cohesion: 0.40
Nodes (4): prospecting_channels_set_updated_at, public.prospecting_channels, public.deals, public.set_updated_at

### Community 154 - "Community 154"
Cohesion: 0.70
Nodes (3): public.deal_loss_records, public.transition_deal_stage_atomic(), public.deals

### Community 155 - "Community 155"
Cohesion: 0.40
Nodes (4): clients_updated_at, public.clients, public.deals, public.set_client_demand_updated_at

### Community 156 - "Community 156"
Cohesion: 0.40
Nodes (4): client_demand_charges_updated_at, public.client_demand_charges, public.client_demands, public.set_client_demand_updated_at

### Community 157 - "Community 157"
Cohesion: 0.40
Nodes (4): client_demand_installments_updated_at, public.client_demand_installments, public.client_demands, public.set_client_demand_updated_at

### Community 158 - "Community 158"
Cohesion: 0.60
Nodes (4): fs, loadEnv(), main(), queryProject()

### Community 159 - "Community 159"
Cohesion: 0.40
Nodes (4): checks, env, expected, outputArgument

### Community 160 - "Community 160"
Cohesion: 0.40
Nodes (3): ModuleScaffoldProps, ScaffoldLink, ScaffoldSection

### Community 161 - "Community 161"
Cohesion: 0.40
Nodes (4): AiCompleteOptions, AiFailure, AiFailureReason, AiResult

### Community 162 - "Community 162"
Cohesion: 0.40
Nodes (4): DealHealthClassification, DealHealthEvidence, DealHealthInput, DealHealthResult

### Community 163 - "Community 163"
Cohesion: 0.40
Nodes (4): CopilotApplyResult, CopilotBriefing, CopilotCompletion, CopilotRequestOptions

### Community 164 - "Community 164"
Cohesion: 0.40
Nodes (4): css, page, picker, workspace

### Community 165 - "Community 165"
Cohesion: 0.40
Nodes (4): { expand }, { minimatch }, packageJson, require

### Community 166 - "Community 166"
Cohesion: 0.83
Nodes (3): gaClientId(), text(), track()

### Community 167 - "Community 167"
Cohesion: 0.50
Nodes (3): public.calendar_events, public.contacts, public.deals

### Community 168 - "Community 168"
Cohesion: 0.50
Nodes (3): public.messages_ai_pendentes, public.deals, public.messages

### Community 169 - "Community 169"
Cohesion: 0.67
Nodes (3): fs, loadEnv(), main()

### Community 170 - "Community 170"
Cohesion: 0.50
Nodes (3): DealForecast, ForecastEvidence, ForecastSummary

### Community 175 - "Community 175"
Cohesion: 0.67
Nodes (3): public.activities, public.deals, public.messages

## Knowledge Gaps
- **1061 isolated node(s):** `Amostra`, `Segmento`, `RouteContext`, `Supabase`, `Supabase` (+1056 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1431 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **48 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getCrmSupabaseAdmin()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 101`, `Community 41`, `Community 76`, `Community 14`, `Community 115`, `Community 116`, `Community 19`, `Community 118`, `Community 21`, `Community 24`, `Community 88`, `Community 29`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Why does `salesPlaybookModule` connect `Community 60` to `Community 32`, `Community 3`, `Community 99`, `Community 12`, `Community 48`, `Community 24`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `aiCompleteDetailed()` connect `Community 7` to `Community 2`, `Community 116`, `Community 5`, `Community 79`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `demandId()` (e.g. with `addChecklist()` and `addComment()`) actually correct?**
  _`demandId()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Amostra`, `Segmento`, `RouteContext` to the rest of the system?**
  _1061 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05782848151062156 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05293383270911361 - nodes in this community are weakly interconnected._