# Health-Compass Admin

🩺 Health Compass - Admin Web App
Submission Report
Project Overview
● Project Name: Health Compass Admin App
● Date: 03-10-2025
Project link :
https://drive.google.com/file/d/1MtUjtzrKC_yel0qPnDrT5QPmUavFNsTv/view?usp=sharing

App Summary
App Name: Health Compass Admin App
Platform: Web
Frontend Framework: Flutter Web
Flutter SDK Version: 3.35.
State Management: Getx
Architecture: Clean Architecture (Domain-driven, modular)

Authentication & Backend
The app integrates:
● Node.Js backend
● MongoDB for health data storage
● Firebase Hosting (for deployment)

Project Structure
The project follows a clean and scalable folder structure:
├── core/ # Shared constants, utils, theme
├── data/ # Entities and repository contracts
├── routes/ # Navigation routes
├── services/ # services and data models
└── presentation/ # UI components, screens, and routing

Build & Run Instructions
Prerequisites:
● Flutter 3.35.1 installed
● Chrome or Edge browser
● Firebase CLI configured (firebase login and firebase init)
Setup:
Run flutter pub get
Run dart run build_runner build --delete-conflicting-outputs
Add Firebase credentials:
○ web/index.html must include Firebase config script.
○ .env file should include Firebase keys.
To Run:
flutter run -d chrome

To Deploy:
flutter build web
firebase deploy

Dependencies
Key packages used:
● getx– state management
● build_runner – data modeling
● flutter_local_notifications – for notification support
● flutter_hooks, responsive_framework, intl – UI helpers

Testing
● Fully tested on latest versions of Chrome , Edge , and Firefox
● Responsive on mobile and tablet viewports
● Firebase connections verified with live data
● Form validations and error handling completed
Deliverables
● ✅ Source code folder (Google Drive link):
[Add your zipped project link here]
● ✅ This documentation
● ✅ Build (web/) folder if required
Final Notes
The Health Compass Admin web app is ready for deployment and scaling.
Firebase project not setup for this project.

Submitted By:
Flutter Development Team, Logic Go Infotech LLP