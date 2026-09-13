// Escore de Phoenix — lógica de cálculo
// Basado en las fórmulas de la planilla original, con el subscore de
// coagulación limitado a 2 puntos como en el Phoenix Sepsis Score oficial:
//   Cardiovascular = drogas + lactico + TAM               (máx. 6)
//   Coagulación    = min(plaquetas + RIN + dimero + fibrinogeno, 2)
//   Total = pafi + Cardiovascular + Coagulación + glasgow
//   Interpretación: total < 2            -> "Sin criterios de sepsis"
//                   total >= 2 y CV = 0  -> "Sepsis"
//                   total >= 2 y CV >= 1 -> "Shock séptico"

const form = document.getElementById("phoenix-form");

const radioGroups = ["pafi", "drogas", "lactico", "plaquetas", "rin", "dimero", "fibrinogeno", "glasgow"];

const tamEdadSelect = document.getElementById("tam-edad");
const tamValorInput = document.getElementById("tam-valor");
const tamHint = document.getElementById("tam-hint");

let tamPoints = null;

function computeTam() {
  const edad = tamEdadSelect.value;
  const valorRaw = tamValorInput.value;

  if (!edad || valorRaw === "") {
    tamPoints = null;
    tamHint.textContent = "Seleccione la edad e ingrese la TAM para calcular los puntos.";
    tamHint.dataset.computed = "false";
    return;
  }

  const valor = parseFloat(valorRaw.replace(",", "."));
  if (Number.isNaN(valor)) {
    tamPoints = null;
    tamHint.textContent = "Ingrese un valor numérico válido de TAM.";
    tamHint.dataset.computed = "false";
    return;
  }

  const [high, low] = edad.split("|").map(Number);
  if (valor > high) {
    tamPoints = 0;
  } else if (valor >= low) {
    tamPoints = 1;
  } else {
    tamPoints = 2;
  }

  tamHint.textContent = `TAM: ${tamPoints} punto${tamPoints === 1 ? "" : "s"} (umbral edad: >${high} = 0, ${low}-${high} = 1, <${low} = 2)`;
  tamHint.dataset.computed = "true";
}

function getRadioValue(name) {
  const checked = form.querySelector(`input[name="${name}"]:checked`);
  return checked ? Number(checked.value) : null;
}

const summaryTotal = document.getElementById("summary-total");
const summaryMissing = document.getElementById("summary-missing");
const subResp = document.getElementById("sub-resp");
const subCardio = document.getElementById("sub-cardio");
const subCoagu = document.getElementById("sub-coagu");
const subNeuro = document.getElementById("sub-neuro");
const interpretationEl = document.getElementById("summary-interpretation");

// Tope de 2 puntos para el subscore de coagulación, tal como lo usa
// el Phoenix Sepsis Score oficial (Sanchez-Pinto et al., JAMA 2024),
// aunque la planilla original sumaba los 4 componentes sin tope.
const COAGU_MAX = 2;

function partialSum(values, names) {
  let sum = 0;
  let anyAnswered = false;
  for (const name of names) {
    const v = values[name];
    if (v !== null) {
      sum += v;
      anyAnswered = true;
    }
  }
  return anyAnswered ? sum : null;
}

function recalculate() {
  computeTam();

  const values = {};
  for (const name of radioGroups) values[name] = getRadioValue(name);
  values.tam = tamPoints;

  const allComplete = Object.values(values).every((v) => v !== null);
  summaryMissing.hidden = allComplete;

  const resp = values.pafi;

  // Los subtotales de Cardiovascular y Coagulación se muestran de forma
  // progresiva: suman lo que ya se respondió dentro del capítulo, sin
  // esperar a que estén todas sus preguntas completas.
  const cardio = partialSum(values, ["drogas", "lactico", "tam"]);

  const coaguRaw = partialSum(values, ["plaquetas", "rin", "dimero", "fibrinogeno"]);
  const coagu = coaguRaw === null ? null : Math.min(coaguRaw, COAGU_MAX);

  const neuro = values.glasgow;

  subResp.textContent = resp === null ? "–" : resp;
  subCardio.textContent = cardio === null ? "–" : cardio;
  subCoagu.textContent = coagu === null ? "–" : coagu;
  subNeuro.textContent = neuro === null ? "–" : neuro;

  if (!allComplete) {
    summaryTotal.textContent = "–";
    interpretationEl.textContent = "Puntaje incompleto";
    interpretationEl.dataset.state = "pending";
    return;
  }

  // Para el total y la interpretación sí se necesitan las 9 variables
  // completas, y el subscore de coagulación aplicado con su tope de 2.
  const cardioFinal = values.drogas + values.lactico + values.tam;
  const coaguFinal = Math.min(values.plaquetas + values.rin + values.dimero + values.fibrinogeno, COAGU_MAX);
  const total = resp + cardioFinal + coaguFinal + neuro;
  summaryTotal.textContent = total;

  if (total < 2) {
    interpretationEl.textContent = "Sin criterios de sepsis";
    interpretationEl.dataset.state = "none";
  } else if (cardioFinal === 0) {
    interpretationEl.textContent = "Sepsis";
    interpretationEl.dataset.state = "sepsis";
  } else {
    interpretationEl.textContent = "Shock séptico";
    interpretationEl.dataset.state = "shock";
  }
}

form.addEventListener("change", recalculate);
tamValorInput.addEventListener("input", recalculate);

document.getElementById("reset-btn").addEventListener("click", () => {
  form.reset();
  tamPoints = null;
  recalculate();
});

recalculate();

// Registro del service worker para uso offline
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* si falla el registro, la app sigue funcionando online */
    });
  });
}
