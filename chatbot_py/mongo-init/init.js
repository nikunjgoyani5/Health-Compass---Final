// MongoDB initialization script for Health Compass AI System

// Create database
use health-compass;

// Create collections with proper indexes
db.createCollection("ai_query_logs");
db.createCollection("supplement_view_logs");

// New collections for expanded functionality
db.createCollection("supplement");
db.createCollection("medicine");
db.createCollection("vaccine");
db.createCollection("medicineschedule");
db.createCollection("vaccineschedule");

// Create indexes for better performance
db.ai_query_logs.createIndex({ "timestamp": -1 });
db.ai_query_logs.createIndex({ "supplement_id": 1 });
db.ai_query_logs.createIndex({ "medicine_id": 1 });
db.ai_query_logs.createIndex({ "vaccine_id": 1 });
db.ai_query_logs.createIndex({ "anon_token": 1 });
db.ai_query_logs.createIndex({ "success": 1 });

db.supplement_view_logs.createIndex({ "timestamp": -1 });
db.supplement_view_logs.createIndex({ "supplement_id": 1 });
db.supplement_view_logs.createIndex({ "anon_token": 1 });

// Indexes for new collections
db.supplement.createIndex({ "name": "text", "description": "text" });
db.supplement.createIndex({ "category": 1 });
db.supplement.createIndex({ "created_at": -1 });

db.medicine.createIndex({ "name": "text", "description": "text" });
db.medicine.createIndex({ "generic_name": "text" });
db.medicine.createIndex({ "created_at": -1 });

db.vaccine.createIndex({ "name": "text", "description": "text" });
db.vaccine.createIndex({ "target_disease": "text" });
db.vaccine.createIndex({ "created_at": -1 });

db.medicineschedule.createIndex({ "anon_token": 1 });
db.medicineschedule.createIndex({ "medicine_id": 1 });
db.medicineschedule.createIndex({ "start_date": 1 });
db.medicineschedule.createIndex({ "end_date": 1 });

db.vaccineschedule.createIndex({ "anon_token": 1 });
db.vaccineschedule.createIndex({ "vaccine_id": 1 });
db.vaccineschedule.createIndex({ "due_date": 1 });
db.vaccineschedule.createIndex({ "completed_date": 1 });

print("Health Compass AI System database initialized successfully!");
