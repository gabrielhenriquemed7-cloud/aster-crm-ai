export type ScoreValue = number | boolean | null;
export type ScoreCriterion = {
  key: string;
  label: string;
  type: "boolean" | "number";
  points?: number;
  unit?: string;
};
export type ScoreDefinition = {
  id: string;
  name: string;
  contexts: RegExp;
  criteria: ScoreCriterion[];
  reference: string;
  limitations: string;
  interpret: (score: number) => string;
};
export type ScoreResult = {
  definition: ScoreDefinition;
  score: number;
  complete: boolean;
  missing: ScoreCriterion[];
  used: Array<{ criterion: ScoreCriterion; value: ScoreValue; points: number }>;
  interpretation: string;
};

const yes = (key: string, label: string, points = 1): ScoreCriterion => ({
  key,
  label,
  type: "boolean",
  points,
});
const num = (key: string, label: string, unit?: string): ScoreCriterion => ({
  key,
  label,
  type: "number",
  unit,
});
const risk = (cuts: number[], labels: string[]) => (score: number) =>
  labels[cuts.findIndex((cut) => score < cut)] ?? labels.at(-1)!;
const ref = (title: string, url: string) => `${title} — ${url}`;

export const scoreDefinitions: ScoreDefinition[] = [
  {
    id: "qsofa",
    name: "qSOFA",
    contexts: /sepse|sepsis|infec[cç][aã]o|choque s[eé]ptico/i,
    criteria: [
      yes("rr22", "FR ≥ 22 irpm"),
      yes("sbp100", "PAS ≤ 100 mmHg"),
      yes("mental", "Alteração do estado mental"),
    ],
    reference: ref(
      "Sepsis-3 (JAMA, 2016)",
      "https://doi.org/10.1001/jama.2016.0288",
    ),
    limitations:
      "Ferramenta prognóstica; não deve ser usada isoladamente para rastrear ou excluir sepse.",
    interpret: risk(
      [1, 2],
      [
        "0: menor risco prognóstico.",
        "1: risco intermediário; correlacionar clinicamente.",
        "≥2: maior risco de desfecho desfavorável; avaliar prontamente.",
      ],
    ),
  },
  {
    id: "sofa",
    name: "SOFA",
    contexts: /sepse|sepsis|disfun[cç][aã]o org[aâ]nica/i,
    criteria: [
      num("resp", "Respiratório (0–4)"),
      num("coag", "Coagulação (0–4)"),
      num("liver", "Hepático (0–4)"),
      num("cardio", "Cardiovascular (0–4)"),
      num("cns", "SNC/Glasgow (0–4)"),
      num("renal", "Renal (0–4)"),
    ],
    reference: ref(
      "SOFA — Intensive Care Medicine, 1996",
      "https://doi.org/10.1007/BF01709751",
    ),
    limitations:
      "Requer dados laboratoriais e contexto de cuidado agudo; a variação temporal é clinicamente relevante.",
    interpret: (s) =>
      `SOFA ${s}; maior pontuação indica maior disfunção orgânica.`,
  },
  {
    id: "news2",
    name: "NEWS2",
    contexts: /sepse|deteriora[cç][aã]o|urg[eê]ncia|dispneia|sinais vitais/i,
    criteria: [
      num("rrPts", "FR (pontos 0–3)"),
      num("spo2Pts", "SpO₂ (pontos 0–3)"),
      num("oxygenPts", "Oxigênio suplementar (0/2)"),
      num("tempPts", "Temperatura (pontos 0–3)"),
      num("sbpPts", "PAS (pontos 0–3)"),
      num("hrPts", "FC (pontos 0–3)"),
      num("consciousPts", "Consciência/confusão (pontos 0/3)"),
    ],
    reference: ref(
      "Royal College of Physicians — NEWS2",
      "https://www.rcplondon.ac.uk/projects/outputs/national-early-warning-score-news-2",
    ),
    limitations:
      "Aplicar a escala SpO₂ apropriada e seguir a política institucional de escalonamento.",
    interpret: risk(
      [1, 5, 7],
      [
        "0: baixo risco.",
        "1–4: baixo risco agregado; observar parâmetros isolados.",
        "5–6: risco médio.",
        "≥7: alto risco clínico.",
      ],
    ),
  },
  {
    id: "curb65",
    name: "CURB-65",
    contexts: /pneumonia|infec[cç][aã]o respirat[oó]ria/i,
    criteria: [
      yes("confusion", "Confusão"),
      yes("urea", "Ureia > 7 mmol/L (≈42 mg/dL)"),
      yes("rr30", "FR ≥ 30 irpm"),
      yes("lowBp", "PAS < 90 ou PAD ≤ 60 mmHg"),
      yes("age65", "Idade ≥ 65 anos"),
    ],
    reference: ref("Thorax, 2003", "https://doi.org/10.1136/thorax.58.5.377"),
    limitations:
      "Não substitui julgamento clínico; circunstâncias sociais, oxigenação e comorbidades também influenciam o local de cuidado.",
    interpret: risk(
      [1, 2, 3],
      [
        "0: baixo risco.",
        "1: baixo risco.",
        "2: risco intermediário.",
        "3–5: alto risco; avaliar manejo hospitalar.",
      ],
    ),
  },
  {
    id: "psi",
    name: "PSI",
    contexts: /pneumonia/i,
    criteria: [num("psiTotal", "Pontuação PSI total")],
    reference: ref(
      "Pneumonia Severity Index — NEJM, 1997",
      "https://doi.org/10.1056/NEJM199701233360402",
    ),
    limitations:
      "O cálculo completo exige dados demográficos, comorbidades, exame, laboratório e imagem.",
    interpret: risk(
      [51, 71, 91, 131],
      [
        "Classe I.",
        "Classe II — baixo risco.",
        "Classe III — baixo a intermediário.",
        "Classe IV — risco elevado.",
        "Classe V — risco elevado.",
      ],
    ),
  },
  {
    id: "wells_dvt",
    name: "Wells TVP",
    contexts: /\btvp\b|trombose venosa|edema unilateral/i,
    criteria: [
      yes("cancer", "Câncer ativo"),
      yes("paralysis", "Paralisia/imobilização de membro"),
      yes("bedrest", "Acamado ≥3 dias ou cirurgia recente"),
      yes("tenderness", "Dor no trajeto venoso profundo"),
      yes("swelling", "Membro inteiro edemaciado"),
      yes("calf", "Panturrilha ≥3 cm maior"),
      yes("pitting", "Edema depressível unilateral"),
      yes("collateral", "Veias colaterais superficiais"),
      yes("previous", "TVP prévia"),
      yes("alternative", "Diagnóstico alternativo tão provável", -2),
    ],
    reference: ref(
      "Wells clinical model — Lancet, 1997",
      "https://doi.org/10.1016/S0140-6736(97)08140-3",
    ),
    limitations:
      "Usar com estratégia diagnóstica local e probabilidade pré-teste; não confirma TVP.",
    interpret: risk(
      [1, 3],
      [
        "TVP improvável (modelo de 3 níveis: baixo).",
        "Probabilidade moderada.",
        "Alta probabilidade clínica.",
      ],
    ),
  },
  {
    id: "wells_pe",
    name: "Wells TEP",
    contexts: /\btep\b|embolia pulmonar|tromboembolismo pulmonar/i,
    criteria: [
      yes("dvtSigns", "Sinais clínicos de TVP", 3),
      yes("peLikely", "TEP mais provável que alternativa", 3),
      yes("tachy", "FC > 100", 1.5),
      yes("immob", "Imobilização/cirurgia recente", 1.5),
      yes("priorVte", "TEV prévio", 1.5),
      yes("hemoptysis", "Hemoptise", 1),
      yes("malignancy", "Malignidade", 1),
    ],
    reference: ref(
      "Wells PE — Thromb Haemost, 2000",
      "https://pubmed.ncbi.nlm.nih.gov/10744147/",
    ),
    limitations:
      "Depende de probabilidade clínica e estratégia validada com D-dímero/imagem.",
    interpret: risk(
      [2, 6],
      [
        "Baixa probabilidade (3 níveis).",
        "Probabilidade moderada.",
        "Alta probabilidade clínica.",
      ],
    ),
  },
  {
    id: "geneva",
    name: "Geneva revisado",
    contexts: /\btep\b|embolia pulmonar/i,
    criteria: [
      yes("age65g", "Idade >65", 1),
      yes("priorVteg", "TEV prévio", 3),
      yes("surgery", "Cirurgia/fratura no último mês", 2),
      yes("cancerG", "Câncer ativo", 2),
      yes("unilateralPain", "Dor unilateral em membro", 3),
      yes("hemoptysisG", "Hemoptise", 2),
      yes("hr75", "FC 75–94", 3),
      yes("hr95", "FC ≥95", 5),
      yes("palpation", "Dor à palpação venosa e edema unilateral", 4),
    ],
    reference: ref(
      "Revised Geneva score — Ann Intern Med, 2006",
      "https://doi.org/10.7326/0003-4819-144-3-200602070-00004",
    ),
    limitations: "Não confirma TEP; integrar a uma via diagnóstica validada.",
    interpret: risk(
      [4, 11],
      [
        "Baixa probabilidade.",
        "Probabilidade intermediária.",
        "Alta probabilidade.",
      ],
    ),
  },
  {
    id: "cha2ds2vasc",
    name: "CHA₂DS₂-VASc",
    contexts: /fibrila[cç][aã]o atrial|\bfa\b/i,
    criteria: [
      yes("chf", "Insuficiência cardíaca", 1),
      yes("htn", "Hipertensão", 1),
      yes("age75", "Idade ≥75", 2),
      yes("diabetes", "Diabetes", 1),
      yes("stroke", "AVC/AIT/TE prévio", 2),
      yes("vascular", "Doença vascular", 1),
      yes("age6574", "Idade 65–74", 1),
      yes("female", "Sexo feminino", 1),
    ],
    reference: ref(
      "ESC Atrial Fibrillation Guidelines",
      "https://www.escardio.org/Guidelines/Clinical-Practice-Guidelines/Atrial-Fibrillation",
    ),
    limitations:
      "Auxilia estimativa de risco tromboembólico; decisões devem seguir diretriz atual e contexto individual.",
    interpret: (s) =>
      `${s} ponto(s): risco tromboembólico crescente conforme a pontuação.`,
  },
  {
    id: "hasbled",
    name: "HAS-BLED",
    contexts: /fibrila[cç][aã]o atrial|anticoagula/i,
    criteria: [
      yes("htnB", "Hipertensão não controlada"),
      yes("renalB", "Função renal anormal"),
      yes("liverB", "Função hepática anormal"),
      yes("strokeB", "AVC prévio"),
      yes("bleeding", "Sangramento prévio/predisposição"),
      yes("inr", "INR lábil"),
      yes("elderly", "Idade >65"),
      yes("drugs", "Fármacos predisponentes"),
      yes("alcohol", "Álcool"),
    ],
    reference: ref(
      "HAS-BLED — Chest, 2010",
      "https://doi.org/10.1378/chest.10-0134",
    ),
    limitations:
      "Risco alto sinaliza fatores modificáveis e seguimento mais próximo; não é motivo isolado para negar anticoagulação.",
    interpret: (s) =>
      `${s} ponto(s)${s >= 3 ? ": risco aumentado; revisar fatores modificáveis." : ": risco não elevado pelo limiar usual."}`,
  },
  {
    id: "gcs",
    name: "Glasgow",
    contexts: /trauma|rebaixamento|consci[eê]ncia|coma|avc/i,
    criteria: [
      num("eye", "Abertura ocular (1–4)"),
      num("verbal", "Resposta verbal (1–5)"),
      num("motor", "Resposta motora (1–6)"),
    ],
    reference: ref(
      "Glasgow Coma Scale — Lancet, 1974",
      "https://doi.org/10.1016/S0140-6736(74)91639-0",
    ),
    limitations:
      "Registrar componentes separadamente; sedação, intubação e barreiras de comunicação limitam interpretação.",
    interpret: risk(
      [9, 13],
      [
        "3–8: comprometimento grave.",
        "9–12: comprometimento moderado.",
        "13–15: comprometimento leve/ausente pela escala.",
      ],
    ),
  },
  {
    id: "nihss",
    name: "NIHSS",
    contexts: /\bavc\b|acidente vascular|d[eé]ficit neurol[oó]gico/i,
    criteria: [num("nihssTotal", "Pontuação NIHSS total (0–42)")],
    reference: ref(
      "NIH Stroke Scale — NINDS",
      "https://www.ninds.nih.gov/health-information/public-education/know-stroke/health-professionals/nih-stroke-scale",
    ),
    limitations:
      "Deve ser aplicada por profissional treinado; pode subestimar déficits de circulação posterior.",
    interpret: risk(
      [1, 5, 16, 21],
      [
        "0: sem déficit mensurável.",
        "1–4: déficit menor.",
        "5–15: moderado.",
        "16–20: moderado a grave.",
        "21–42: grave.",
      ],
    ),
  },
  {
    id: "centor",
    name: "Centor",
    contexts: /dor de garganta|faringite|odinofagia|amigdalite/i,
    criteria: [
      yes("tonsil", "Exsudato/amígdalas aumentadas"),
      yes("nodes", "Linfonodos cervicais anteriores dolorosos"),
      yes("fever", "Temperatura >38 °C"),
      yes("noCough", "Ausência de tosse"),
    ],
    reference: ref(
      "Centor criteria — Med Decis Making, 1981",
      "https://doi.org/10.1177/0272989X8100100104",
    ),
    limitations:
      "Auxilia decisão de testagem; prevalência local e diagnóstico diferencial importam.",
    interpret: (s) =>
      `${s} ponto(s): probabilidade de estreptococo aumenta com a pontuação.`,
  },
  {
    id: "mcisaac",
    name: "McIsaac",
    contexts: /dor de garganta|faringite|odinofagia|amigdalite/i,
    criteria: [
      yes("tonsilM", "Exsudato/amígdalas aumentadas"),
      yes("nodesM", "Linfonodos cervicais anteriores dolorosos"),
      yes("feverM", "Temperatura >38 °C"),
      yes("noCoughM", "Ausência de tosse"),
      yes("age314", "Idade 3–14", 1),
      yes("age45", "Idade ≥45", -1),
    ],
    reference: ref(
      "McIsaac score — CMAJ, 1998",
      "https://www.cmaj.ca/content/158/1/75",
    ),
    limitations:
      "Não substitui teste quando indicado nem avaliação de diagnósticos alternativos.",
    interpret: (s) =>
      `${s} ponto(s): usar para orientar testagem conforme protocolo local.`,
  },
  ...[
    [
      "heart",
      "HEART",
      /dor tor[aá]cica|s[ií]ndrome coronariana/i,
      "HEART Pathway — https://doi.org/10.1016/j.ijcard.2008.03.028",
      [
        num("historyH", "História (0–2)"),
        num("ecgH", "ECG (0–2)"),
        num("ageH", "Idade (0–2)"),
        num("riskH", "Fatores de risco (0–2)"),
        num("troponinH", "Troponina (0–2)"),
      ],
    ],
    [
      "timi",
      "TIMI",
      /dor tor[aá]cica|s[ií]ndrome coronariana/i,
      "TIMI UA/NSTEMI — https://doi.org/10.1001/jama.284.7.835",
      [num("timiTotal", "Critérios TIMI presentes (0–7)")],
    ],
    [
      "grace",
      "GRACE",
      /dor tor[aá]cica|s[ií]ndrome coronariana/i,
      "GRACE 2.0 — https://www.outcomes-umassmed.org/grace/",
      [num("graceTotal", "Pontuação GRACE total")],
    ],
    [
      "pews",
      "PEWS",
      /pediatr|crian[cç]a|lactente/i,
      "Bedside PEWS — https://doi.org/10.1097/01.PCC.0000161570.42921.2B",
      [
        num("behavior", "Comportamento (0–3)"),
        num("cardioP", "Cardiovascular (0–3)"),
        num("respP", "Respiratório (0–3)"),
      ],
    ],
    [
      "rts",
      "RTS",
      /trauma|politrauma/i,
      "Revised Trauma Score — https://doi.org/10.1097/00005373-198905000-00017",
      [
        num("gcsR", "Glasgow codificado (0–4)"),
        num("sbpR", "PAS codificada (0–4)"),
        num("rrR", "FR codificada (0–4)"),
      ],
    ],
    [
      "shock_index",
      "Shock Index",
      /choque|trauma|hemorrag|instabilidade/i,
      "Shock Index — https://doi.org/10.1007/BF01478341",
      [
        num("heartRate", "Frequência cardíaca", "bpm"),
        num("systolicBp", "Pressão arterial sistólica", "mmHg"),
      ],
    ],
    [
      "meows",
      "MEOWS",
      /gestante|gr[aá]vida|obst[eé]tr|puerp[eé]rio/i,
      "Modified Early Obstetric Warning Score — https://doi.org/10.1111/j.1471-0528.2007.01438.x",
      [num("meowsTotal", "Pontuação MEOWS conforme protocolo institucional")],
    ],
  ].map(
    ([id, name, contexts, reference, criteria]) =>
      ({
        id,
        name,
        contexts,
        reference,
        criteria,
        limitations:
          "Ferramenta de apoio; validar a versão e os limiares adotados no protocolo institucional.",
        interpret: (s: number) =>
          `${s} ponto(s). Interpretar conforme a versão validada e o contexto clínico.`,
      }) as ScoreDefinition,
  ),
];

function criterionPoints(
  definition: ScoreDefinition,
  criterion: ScoreCriterion,
  value: ScoreValue,
  values: Record<string, ScoreValue>,
) {
  if (definition.id === "shock_index")
    return criterion.key === "heartRate"
      ? 0
      : Number(values.heartRate) / Math.max(1, Number(values.systolicBp));
  if (definition.id === "rts") {
    const weights: Record<string, number> = {
      gcsR: 0.9368,
      sbpR: 0.7326,
      rrR: 0.2908,
    };
    return Number(value) * weights[criterion.key];
  }
  return criterion.type === "boolean"
    ? value
      ? (criterion.points ?? 1)
      : 0
    : Number(value);
}

export function calculateScore(
  definition: ScoreDefinition,
  values: Record<string, ScoreValue>,
): ScoreResult {
  const missing = definition.criteria.filter(
    (c) => values[c.key] === null || values[c.key] === undefined,
  );
  const used = definition.criteria
    .filter((c) => !missing.includes(c))
    .map((criterion) => ({
      criterion,
      value: values[criterion.key],
      points: criterionPoints(
        definition,
        criterion,
        values[criterion.key],
        values,
      ),
    }));
  const raw =
    definition.id === "shock_index"
      ? (used.find((x) => x.criterion.key === "systolicBp")?.points ?? 0)
      : used.reduce((sum, x) => sum + x.points, 0);
  const score = Number(
    raw.toFixed(
      definition.id === "shock_index" || definition.id === "rts" ? 2 : 1,
    ),
  );
  return {
    definition,
    score,
    complete: missing.length === 0,
    missing,
    used,
    interpretation: definition.interpret(score),
  };
}

export function relevantScores(context: string) {
  return scoreDefinitions.filter((score) => score.contexts.test(context));
}

export function extractKnownValues(
  context: string,
  age: number | null,
  gender: string | null,
): Record<string, ScoreValue> {
  const value: Record<string, ScoreValue> = {};
  const numberAfter = (pattern: RegExp) => {
    const match = context.match(pattern);
    return match ? Number(match[1].replace(",", ".")) : null;
  };
  const rr = numberAfter(
    /(?:FR|frequ[eê]ncia respirat[oó]ria)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
  );
  const hr = numberAfter(
    /(?:FC|frequ[eê]ncia card[ií]aca)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i,
  );
  const bp = context.match(
    /(?:PA|press[aã]o arterial)\s*[:=]?\s*(\d{2,3})\s*[x/]\s*(\d{2,3})/i,
  );
  const gcs = numberAfter(/(?:Glasgow|GCS)\s*[:=]?\s*(\d+)/i);
  if (rr !== null) {
    value.rr22 = rr >= 22;
    value.rr30 = rr >= 30;
    value.rrR =
      rr >= 10 && rr <= 29 ? 4 : rr > 29 ? 3 : rr >= 6 ? 2 : rr >= 1 ? 1 : 0;
  }
  if (hr !== null) {
    value.heartRate = hr;
    value.tachy = hr > 100;
    value.hr75 = hr >= 75 && hr <= 94;
    value.hr95 = hr >= 95;
  }
  if (bp) {
    const sbp = Number(bp[1]),
      dbp = Number(bp[2]);
    value.systolicBp = sbp;
    value.sbp100 = sbp <= 100;
    value.lowBp = sbp < 90 || dbp <= 60;
    value.sbpR =
      sbp > 89 ? 4 : sbp >= 76 ? 3 : sbp >= 50 ? 2 : sbp >= 1 ? 1 : 0;
  }
  if (gcs !== null) {
    value.mental = gcs < 15;
    value.gcsR = gcs >= 13 ? 4 : gcs >= 9 ? 3 : gcs >= 6 ? 2 : gcs >= 4 ? 1 : 0;
  }
  if (age !== null) {
    value.age65 = age >= 65;
    value.age65g = age > 65;
    value.age75 = age >= 75;
    value.age6574 = age >= 65 && age <= 74;
    value.elderly = age > 65;
    value.age314 = age >= 3 && age <= 14;
    value.age45 = age >= 45;
  }
  value.female = /feminino|mulher/i.test(gender ?? "");
  const facts: Array<[string, RegExp]> = [
    ["htn", /hipertens|\bHAS\b/i],
    ["htnB", /hipertens|\bHAS\b/i],
    ["diabetes", /diabet/i],
    ["chf", /insufici[eê]ncia card[ií]aca/i],
    ["stroke", /AVC|AIT/i],
    ["strokeB", /AVC|AIT/i],
    ["noCough", /nega tosse|sem tosse|aus[eê]ncia de tosse/i],
    ["noCoughM", /nega tosse|sem tosse|aus[eê]ncia de tosse/i],
    ["confusion", /confus[aã]o|desorientad/i],
    ["fever", /febre|temperatura\s*(?:>|acima)/i],
    ["feverM", /febre|temperatura\s*(?:>|acima)/i],
  ];
  for (const [key, pattern] of facts)
    if (pattern.test(context)) value[key] = true;
  return value;
}
