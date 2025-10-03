# 🧪 AI Functionality Testing Guide

## Overview
This guide helps you test all AI functionalities in the Health Compass system to ensure everything works properly.

## 🚀 Quick Test Commands

### 1. Simple Pattern Recognition Test (No API Key Required)
```bash
node test_ai_simple.js
```
This tests the pattern matching logic without making API calls.

### 2. Full AI Test Suite (Requires API Key)
```bash
# Set your OpenAI API key
export OPENAI_API_KEY="your-api-key-here"

# Run comprehensive tests
node test_ai_functionality.js
```

## 📋 Manual Testing Checklist

### ✅ General Health Queries
Test these questions should return `general_query` intent:

**Basic Health Questions:**
- "I have a stomachache today"
- "I have a very high fever today"
- "I am running a high fever today"
- "What should I do for fever?"
- "How to treat headache?"
- "Health advice for cold"
- "I have pain in my stomach"
- "What medicine should I take for fever?"
- "How to cure cough?"
- "I feel dizzy and weak"

**Expected Behavior:**
- Should get proper health advice response
- Should NOT go to medicine creation flow
- Should provide medical guidance

### ✅ Medicine Creation
Test these queries should return `create_medicine` intent:

**Medicine Creation Queries:**
- "Create a new medicine with name Paracetamol"
- "Add medicine with dosage 500mg and price 50"
- "Register medicine with name Aspirin, dosage 100mg, price 25, quantity 100"
- "Store medicine information: name Ibuprofen, dosage 400mg"
- "I want to add a medicine with name Crocin"
- "Create medicine with name Dolo 650, dosage 650mg, price 30, quantity 50"

**Expected Behavior:**
- Should ask for required fields (name, dosage, price, quantity, etc.)
- Should validate input (no decimals, future dates, etc.)
- Should create medicine successfully

### ✅ Vaccine Creation
Test these queries should return `create_vaccine` intent:

**Vaccine Creation Queries:**
- "Create a new vaccine with name COVID-19"
- "Add vaccine with name Polio, provider WHO"
- "Register vaccine with name BCG, provider Government"
- "Store vaccine information: name MMR, provider CDC"
- "I want to add a vaccine with name Hepatitis B"

**Expected Behavior:**
- Should ask for required fields (name, provider)
- Should create vaccine successfully
- Should handle comprehensive vaccine creation

### ✅ Medicine Scheduling
Test these queries should return `create_medicine_schedule` intent:

**Medicine Scheduling Queries:**
- "Create a medicine schedule for me"
- "I need to schedule my medicine"
- "Set up reminders for my medicine"
- "When should I take my medicine?"
- "Create a daily schedule for my medicine"
- "Add medicine to my daily routine"
- "Set up medicine reminders"
- "Schedule my Paracetamol for morning and evening"

**Expected Behavior:**
- Should ask for medicine name, start date, end date, dose times
- Should validate dates (no past dates)
- Should validate times (no past times for today)
- Should create schedule successfully

### ✅ Vaccine Scheduling
Test these queries should return `create_vaccine_schedule` intent:

**Vaccine Scheduling Queries:**
- "Create a vaccine schedule for me"
- "I need to schedule my vaccine"
- "Set up vaccine appointment"
- "When should I get my vaccine?"
- "Create a vaccine schedule with date"
- "Add vaccine to my schedule"
- "Set up vaccine reminders"
- "Schedule my COVID-19 vaccine for next week"

**Expected Behavior:**
- Should ask for vaccine name, date, time
- Should validate dates (no past dates)
- Should validate times (no past times for today)
- Should create schedule successfully

### ✅ Check Schedules
Test these queries should return `check_*_schedule` intent:

**Check Medicine Schedule:**
- "Check my medicine schedule"
- "What medicines do I have today?"
- "Show my medicine schedule for today"
- "What medicines are scheduled?"
- "Check my upcoming medicines"

**Check Vaccine Schedule:**
- "Check my vaccine schedule"
- "What vaccines do I have today?"
- "Show my vaccine schedule for today"
- "What vaccines are scheduled?"
- "Check my upcoming vaccines"

**Expected Behavior:**
- Should fetch and display scheduled items
- Should show proper formatting
- Should handle empty schedules gracefully

### ✅ Health Score Generation
Test these queries should return `generate_health_score` intent:

**Health Score Queries:**
- "Generate my health score"
- "Calculate my health score"
- "What is my health score?"
- "I want to know my health score"
- "Create a health score for me"
- "Assess my health"
- "Rate my health"
- "Health assessment"
- "Health evaluation"
- "Health analysis"

**Expected Behavior:**
- Should ask health-related questions
- Should collect answers step by step
- Should calculate and save health score
- Should provide meaningful feedback

## 🔍 Edge Cases to Test

### Confusing Queries (Should be General Queries)
- "I have medicine for fever" → Should be `general_query`
- "My medicine is not working" → Should be `general_query`
- "I took medicine but still have fever" → Should be `general_query`
- "What medicine should I take?" → Should be `general_query`
- "I have vaccine side effects" → Should be `general_query`
- "My vaccine is due" → Should be `general_query`

### Mixed Queries
- "I have fever and need medicine schedule" → Should handle appropriately
- "I want to create medicine and schedule it" → Should handle step by step

## 🚨 Common Issues to Watch For

### 1. Intent Misclassification
- General health questions going to creation flows
- Creation queries going to general queries
- Scheduling queries going to creation flows

### 2. Validation Issues
- Decimal numbers in quantity/price
- Past dates in schedules
- Past times for today's schedule
- Missing required fields

### 3. Flow Issues
- Getting stuck in creation loops
- Not handling exit/cancel properly
- Not clearing cache properly
- Session management issues

### 4. API Issues
- Authentication failures
- Network timeouts
- Invalid responses
- Error handling

## 📊 Test Results Tracking

### Success Criteria
- ✅ Intent detection accuracy > 90%
- ✅ General health queries work properly
- ✅ Creation flows complete successfully
- ✅ Scheduling works with proper validation
- ✅ Error handling is graceful
- ✅ No infinite loops or stuck states

### Test Logging
- Log all test results
- Track success/failure rates
- Note any errors or issues
- Document edge cases that fail

## 🛠️ Debugging Tips

### 1. Check Console Logs
Look for these log patterns:
- `🚨 SUPER-EARLY: Detected general health question`
- `🔍 Detected general health question - skipping creation hints check`
- `🔒 Set creation phase and skipping intent detection`

### 2. Check Intent Detection
- Verify the detected intent matches expected
- Check if fallback logic is working
- Ensure pattern matching is correct

### 3. Check Flow State
- Verify `draftCache` state
- Check if `shouldSkipIntentDetection` is correct
- Ensure proper phase transitions

### 4. Check API Calls
- Verify authentication headers
- Check API endpoints
- Ensure proper error handling

## 📝 Test Report Template

```
Test Date: [DATE]
Tester: [NAME]
Environment: [DEV/STAGING/PROD]

### Test Results:
- General Health Queries: [PASS/FAIL] ([X]/[Y] tests)
- Medicine Creation: [PASS/FAIL] ([X]/[Y] tests)
- Vaccine Creation: [PASS/FAIL] ([X]/[Y] tests)
- Medicine Scheduling: [PASS/FAIL] ([X]/[Y] tests)
- Vaccine Scheduling: [PASS/FAIL] ([X]/[Y] tests)
- Check Schedules: [PASS/FAIL] ([X]/[Y] tests)
- Health Score: [PASS/FAIL] ([X]/[Y] tests)

### Issues Found:
1. [Issue description]
2. [Issue description]

### Recommendations:
1. [Recommendation]
2. [Recommendation]

### Overall Status: [PASS/FAIL]
```

## 🎯 Success Metrics

- **Intent Detection Accuracy**: > 90%
- **General Query Handling**: 100% success rate
- **Creation Flow Completion**: > 95% success rate
- **Scheduling Flow Completion**: > 95% success rate
- **Error Handling**: Graceful degradation
- **User Experience**: Smooth, intuitive flows

---

**Remember**: Test thoroughly and document all issues. The AI system should be robust and handle edge cases gracefully!
