# StudySync — Privacy Policy
**Last updated:** 2025-09-14

StudySync exports dated items from Brightspace (e.g., McGill MyCourses) to your calendar via a private ICS feed.

## Data We Collect
- **Account**: email and password (stored as a bcrypt hash).
- **Study data** you save: titles, types (assignment/quiz/exam), optional course names, due dates.
- **Feed token**: random secret used to generate your personal ICS URL.

## What We Don’t Collect
- No university credentials.
- No grades, submissions, files, or messages from Brightspace.
- No tracking, analytics, or ads.

## Purpose
- Authenticate you (JWT).
- Store/generate your private ICS for your calendar app.

## Sharing
- We do not sell or share data with third parties.
- Your ICS link acts like a secret key—anyone with the link can read your due dates.

## Security
- Passwords are hashed with bcrypt.
- Transport is HTTPS.

## Retention & Deletion
- To delete your account/data, open a GitHub issue: https://github.com/faighcv/studysync/issues

## Contact
- https://github.com/faighcv/studysync
