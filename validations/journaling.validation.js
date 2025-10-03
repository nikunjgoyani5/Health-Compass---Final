import Joi from "joi";

const healthNoteValidation = {
  body: Joi.object().keys({
    date: Joi.date().required().label("Date"),

    // 🌱 Core Health Metrics
    mood: Joi.number().max(3).label("Mood"),
    exercise: Joi.number().max(5).label("Exercise"),
    sleepQuality: Joi.number().max(5).label("Sleep Quality"),
    nutrition: Joi.number().max(5).label("Nutrition"),
    energyLevel: Joi.number().max(5).label("Energy Level"),
    stressLevel: Joi.number().max(5).label("Stress Level"),

    // 💧 Lifestyle & Body
    hydration: Joi.number().max(5).label("Hydration"),
    painLevel: Joi.number().min(0).max(10).label("Pain Level"),
    steps: Joi.number().min(0).label("Steps"),
    sedentaryAlert: Joi.boolean().label("Sedentary Alert"),

    // 🧠 Mental & Emotional
    focus: Joi.number().max(5).label("Focus"),
    overallWellbeing: Joi.number().max(5).label("Overall Wellbeing"),
    anxietyLevel: Joi.number().max(5).label("Anxiety Level"),
    socialInteraction: Joi.number().max(5).label("Social Interaction"),

    // 💊 Medical Tracking
    medicationAdherence: Joi.number().max(5).label("Medication Adherence"),

    // Notes
    healthNotes: Joi.array().items(Joi.string().trim()).label("Health Notes"),
  }).custom((value, helpers) => {
    // List of all numeric fields to check
    const numericFields = [
      'mood', 'exercise', 'sleepQuality', 'nutrition', 'energyLevel', 'stressLevel',
      'hydration', 'painLevel', 'steps', 'focus', 'overallWellbeing', 
      'anxietyLevel', 'socialInteraction', 'medicationAdherence'
    ];
    
    // Check if all numeric fields are 0 or undefined
    const allZero = numericFields.every(field => {
      const val = value[field];
      return val === undefined || val === null || val === 0;
    });
    
    // Check if there are any health notes
    const hasHealthNotes = value.healthNotes && value.healthNotes.length > 0 && 
                          value.healthNotes.some(note => note.trim().length > 0);
    
    // If all numeric values are 0 and no meaningful health notes, reject
    if (allZero && !hasHealthNotes) {
      return helpers.error('custom.allZeroValues', {
        message: 'Please fill detailed information properly. At least one health metric should have a meaningful value or add health notes.'
      });
    }
    
    return value;
  }).messages({
    'custom.allZeroValues': 'Please fill detailed information properly. At least one health metric should have a meaningful value or add health notes.'
  }),
};

const addSuggestionNote = {
  body: Joi.object().keys({
    suggestionId: Joi.string().required().label("Suggestion ID"),
    note: Joi.string().label("Note"),
    isCompleted: Joi.boolean().label("Is Completed"),
  }),
};

export default { healthNoteValidation, addSuggestionNote };
