const RULES = {
  phishing_clicked: { delta: 15, reason: 'Clic en phishing simulado' },
  phishing_attachment_opened: { delta: 25, reason: 'Apertura de adjunto en phishing simulado' },
  phishing_data_entered: { delta: 30, reason: 'Envio de datos en phishing simulado' },
  phishing_replied: { delta: 28, reason: 'Respuesta a phishing simulado' },
  pab_report_simulated: { delta: -10, reason: 'Reporte de phishing con PAB (simulado)' },
  pab_report_real: { delta: -5, reason: 'Reporte de correo sospechoso real con PAB' },
  training_completed: { delta: -8, reason: 'Capacitacion completada' },
  training_path_completed: { delta: -15, reason: 'Ruta de aprendizaje completada (extra)' },
  manual_adjustment: { delta: 0, reason: 'Ajuste manual' },
  decay_half_life_days: 90,
  score_min: 0,
  score_max: 100,
  default_risk: 0,
};

export function getRules() {
  return { ...RULES };
}

export function getRule(eventType) {
  return RULES[eventType] || null;
}

export default RULES;
