import mongoose from "mongoose";
import Disclaimer from "../models/disclaimer.model.js";
import { DISCLAIMER_TYPES } from "../config/disclaimer.config.js";
import dotenv from "dotenv";

dotenv.config();

// Sample disclaimer data
const sampleDisclaimers = [
  {
    type: DISCLAIMER_TYPES.MEDICINE,
    title: "Medicine Information Disclaimer",
    content: `IMPORTANT MEDICAL DISCLAIMER

The information provided about medicines is for educational purposes only and should not be considered as medical advice, diagnosis, or treatment recommendation.

⚠️ CRITICAL WARNINGS:
• Always consult with a qualified healthcare professional before taking any medication
• Do not self-diagnose or self-medicate based on information provided
• Individual responses to medications may vary
• Some medicines may have contraindications or side effects
• Drug interactions may occur with other medications
• Dosage requirements may differ based on age, weight, and medical conditions

📋 WHAT WE PROVIDE:
• General information about common medicines
• Basic dosage guidelines for reference
• Common side effects and precautions
• Storage and handling instructions

🚫 WHAT WE DON'T PROVIDE:
• Personalized medical advice
• Prescription recommendations
• Diagnosis of medical conditions
• Emergency medical treatment

🆘 EMERGENCY SITUATIONS:
If you experience severe side effects, allergic reactions, or medical emergencies, seek immediate medical attention or call emergency services.

Remember: Your health and safety are our top priority. Always consult healthcare professionals for proper medical guidance.`,
    createdBy: "64f8a1b2c3d4e5f6a7b8c9d0" // Sample user ID
  },
  {
    type: DISCLAIMER_TYPES.VACCINE,
    title: "Vaccine Information Disclaimer",
    content: `IMPORTANT VACCINE DISCLAIMER

The vaccine information provided is for educational purposes only and should not replace professional medical advice.

⚠️ CRITICAL WARNINGS:
• Always consult with healthcare providers before receiving any vaccine
• Individual medical history and conditions must be considered
• Some vaccines may have contraindications
• Timing and scheduling should be discussed with medical professionals
• Side effects and reactions may vary between individuals

📋 WHAT WE PROVIDE:
• General information about vaccines
• Recommended vaccination schedules
• Common side effects and precautions
• Storage and handling requirements

🚫 WHAT WE DON'T PROVIDE:
• Personalized vaccination recommendations
• Medical advice for specific conditions
• Emergency medical treatment
• Diagnosis of vaccine-related issues

🆘 IMPORTANT NOTES:
• Some vaccines require multiple doses
• Booster shots may be necessary
• Travel vaccines may have specific requirements
• Age and health status affect vaccine eligibility

Remember: Vaccination decisions should always be made in consultation with qualified healthcare professionals who can assess your individual needs and medical history.`,
    createdBy: "64f8a1b2c3d4e5f6a7b8c9d0"
  },
  {
    type: DISCLAIMER_TYPES.SUPPLEMENT,
    title: "Supplement Information Disclaimer",
    content: `IMPORTANT SUPPLEMENT DISCLAIMER

The supplement information provided is for educational purposes only and is not intended as medical advice.

⚠️ CRITICAL WARNINGS:
• Always consult healthcare professionals before taking any supplements
• Supplements may interact with medications
• Individual needs and tolerances vary significantly
• Quality and purity of supplements can vary
• Some supplements may have side effects or contraindications

📋 WHAT WE PROVIDE:
• General information about common supplements
• Basic dosage guidelines for reference
• Potential benefits and risks
• Storage and handling instructions

🚫 WHAT WE DON'T PROVIDE:
• Personalized supplement recommendations
• Medical advice for specific conditions
• Diagnosis or treatment recommendations
• Emergency medical treatment

⚠️ IMPORTANT CONSIDERATIONS:
• Supplements are not regulated like medications
• Quality and potency may vary between brands
• Some supplements may not be suitable for certain medical conditions
• Interactions with prescription medications are possible
• Overdosing on certain supplements can be harmful

🆘 EMERGENCY SITUATIONS:
If you experience adverse reactions to supplements, discontinue use immediately and consult a healthcare professional.

Remember: Supplements should complement, not replace, a balanced diet and proper medical care. Always seek professional guidance for your specific health needs.`,
    createdBy: "64f8a1b2c3d4e5f6a7b8c9d0"
  },
  {
    type: DISCLAIMER_TYPES.SUPPLEMENT_RECOMMENDATION,
    title: "Supplement Recommendation Disclaimer",
    content: `IMPORTANT SUPPLEMENT RECOMMENDATION DISCLAIMER

Any supplement recommendations provided are for informational purposes only and should not be considered as medical advice or treatment recommendations.

⚠️ CRITICAL WARNINGS:
• All supplement recommendations should be discussed with healthcare professionals
• Individual health conditions and medications must be considered
• Supplements may interact with prescription medications
• Quality, purity, and effectiveness of supplements can vary
• Some supplements may not be suitable for your specific health needs

📋 WHAT WE PROVIDE:
• General supplement recommendations based on common health goals
• Educational information about supplement benefits
• Basic dosage guidelines for reference
• Information about potential interactions and side effects

🚫 WHAT WE DON'T PROVIDE:
• Personalized medical advice
• Treatment for specific medical conditions
• Diagnosis or medical recommendations
• Emergency medical treatment
• Guarantees about supplement effectiveness

⚠️ IMPORTANT CONSIDERATIONS:
• Supplement needs vary greatly between individuals
• Age, gender, health status, and lifestyle affect supplement requirements
• Some supplements may not be suitable for certain medical conditions
• Interactions with medications are possible
• Professional guidance is essential for optimal results

🆘 SAFETY FIRST:
• Always inform your healthcare provider about all supplements you're taking
• Start with lower doses and monitor for reactions
• Discontinue use if adverse effects occur
• Choose reputable brands and sources
• Be cautious of exaggerated health claims

Remember: Supplement recommendations are general guidelines only. Your healthcare provider is the best source for personalized supplement advice based on your specific health needs and medical history.`,
    createdBy: "64f8a1b2c3d4e5f6a7b8c9d0"
  }
];

async function initializeDisclaimerData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/health-compass");
    console.log("✅ Connected to MongoDB");

    // Clear existing disclaimers
    await Disclaimer.deleteMany({});
    console.log("🗑️ Cleared existing disclaimers");

    // Create sample disclaimers
    const createdDisclaimers = await Disclaimer.insertMany(sampleDisclaimers);
    console.log(`✅ Created ${createdDisclaimers.length} sample disclaimers`);

    // Display created disclaimers
    console.log("\n📋 Created Disclaimers:");
    createdDisclaimers.forEach((disclaimer, index) => {
      console.log(`${index + 1}. ${disclaimer.typeDisplayName}`);
      console.log(`   Title: ${disclaimer.title}`);
      console.log(`   Content Length: ${disclaimer.content.length} characters`);
      console.log(`   Active: ${disclaimer.isActive}`);
      console.log("");
    });

    console.log("🎉 Disclaimer data initialization completed successfully!");
    
  } catch (error) {
    console.error("❌ Error initializing disclaimer data:", error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
}

// Run the initialization
initializeDisclaimerData();