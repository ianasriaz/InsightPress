# InsightPress - AI Instructions & Project Documentation

**ATTENTION FUTURE AI AGENTS:** Read this file completely before making any modifications to the project. It contains critical architectural decisions and edge cases that you must preserve.

## Project Overview
**InsightPress** is an autonomous, serverless AI agent built for the AWS Builder Center "Weekend Agent Challenge". It acts as a "Morning Briefing Agent" for a WooCommerce store (Khawaja Textile Fabrics - `ktfmultan.com`).

Every morning at 8:00 AM Pakistan Standard Time (03:00 AM UTC), the agent wakes up, fetches exact calendar-day sales and stock metrics from the WooCommerce REST API, generates a smart textual analysis using the Groq API (Llama 3), and emails a premium HTML report to the CEO via Purelymail SMTP.

## Core Architecture
- **Trigger:** AWS EventBridge `ScheduleV2` (`cron(0 3 * * ? *)`). **Do not change this to manual triggers.**
- **Compute:** AWS Lambda (Node.js 20.x runtime).
- **Infrastructure as Code:** AWS SAM (`template.yaml`).
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`). Commits to the `main` branch automatically deploy the stack to AWS.

## Critical Technical Constraints & Edge Cases (DO NOT BREAK THESE)

### 1. The Cloudflare `403 Forbidden` WAF Trap
The target WooCommerce store uses Cloudflare's Bot Fight Mode. Because AWS Lambda runs in an Amazon datacenter (ASN 16509), Cloudflare will instantly block the WooCommerce API request with a `403 Forbidden` error if the `User-Agent` is default or missing.
**Solution:** The Axios instance in `src/app.js` is explicitly configured to spoof a standard browser `User-Agent` (e.g., Mozilla/5.0 Windows NT). **Do not remove or alter the User-Agent headers in the Axios configuration, or the app will permanently break in production.**

### 2. The Email HTML Architecture
Email clients (like Gmail and Outlook) strip out modern CSS like `display: flex` and CSS grids. Furthermore, LLMs are notoriously bad at consistently generating valid, responsive `<table>` structures.
**Solution:** The system explicitly separates the **Intelligence Layer** from the **Presentation Layer**. 
- The Groq AI is strictly prompted to output *plain text only* (the "Daily Insight" paragraph).
- The HTML UI is hardcoded as a bulletproof string in `src/app.js` using inline styles and native HTML `<table>` elements.
- **Do not instruct the LLM to generate the HTML.**

### 3. Exact Calendar Day Data
The CEO reads this report at 8 AM. The data must reflect the *previous calendar day* exactly (00:00:00 to 23:59:59). 
**Solution:** The WooCommerce API `after` and `before` parameters are strictly calculated using `startOfYesterday` and `endOfYesterday`. Do not revert this to a "rolling 24-hour window".

## Environment Variables
The project relies on these keys, which are stored as GitHub Repository Secrets and injected into `template.yaml` by the GitHub Actions pipeline:
- `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY` & `AWS_REGION`
- `STORE_URL` (https://ktfmultan.com)
- `WC_CONSUMER_KEY` & `WC_CONSUMER_SECRET`
- `GROQ_API_KEY` (Using model: `llama-3.1-8b-instant`)
- `SMTP_USER` & `SMTP_PASS`
- `FROM_EMAIL` & `TO_EMAIL`

## Local Testing
To test the script locally without deploying to AWS:
1. Ensure there is an `env.json` file in the root directory mapping the variables exactly as defined in `template.yaml`.
2. Run `node test.js`. 
3. Note: `env.json` is strictly ignored in `.gitignore` to prevent leaking credentials.
