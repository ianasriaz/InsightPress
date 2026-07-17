# 🌅 InsightPress 

![AWS Serverless](https://img.shields.io/badge/AWS-Serverless-FF9900?logo=amazonaws)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=nodedotjs)
![Groq](https://img.shields.io/badge/AI-Groq%20%28Llama%203%29-f55036?logo=meta)
![WooCommerce](https://img.shields.io/badge/Platform-WooCommerce-96588a?logo=woocommerce)

**InsightPress** is an autonomous, serverless AI "Morning Briefing Agent" tailored for WooCommerce store owners. Built for the AWS Builder Center "Weekend Agent Challenge", it wakes up every morning, synthesizes complex store data into actionable insights, and delivers a premium email report straight to the CEO.

## 🎯 What it Does

Every day at **8:00 AM PST (03:00 AM UTC)**, InsightPress:
1. **Fetches Data:** Securely pulls the exact previous calendar-day sales, order counts, and stock metrics directly from the WooCommerce REST API.
2. **Analyzes Context:** Sends the raw data points to the **Groq API (Llama 3.1 8b)** for smart, high-speed textual analysis and business insights.
3. **Delivers the Brief:** Formats the insights into a bulletproof, premium HTML email using native tables (ensuring perfect rendering on Gmail, Outlook, and Apple Mail) and sends it via Purelymail SMTP.

## 🏗 Architecture & Tech Stack

InsightPress operates entirely on a serverless paradigm, eliminating infrastructure management and reducing costs to near-zero.

- **Trigger:** AWS EventBridge (`ScheduleV2`) 
- **Compute:** AWS Lambda (Node.js 20.x)
- **Intelligence:** Groq Cloud (`llama-3.1-8b-instant`)
- **Infrastructure as Code (IaC):** AWS SAM (`template.yaml`)
- **CI/CD:** GitHub Actions for automated deployment to AWS

## ✨ Key Technical Achievements & Solutions

### 🛡️ Bypassing Cloudflare WAF Traps
Modern headless setups often struggle with basic API scraping due to robust WAFs like Cloudflare's Bot Fight Mode. Since AWS Lambdas originate from well-known datacenter IPs (ASN 16509), Cloudflare instantly drops default `axios` requests with a `403 Forbidden`. InsightPress is engineered to bypass this by intelligently spoofing modern browser `User-Agent` headers.

### 📧 The Intelligence / Presentation Split
Email clients are notorious for destroying modern CSS (like Flexbox or Grid) and LLMs frequently hallucinate broken HTML tables. InsightPress solves this by strictly isolating concerns:
- **Intelligence Layer:** The LLM is heavily prompted to generate *only* the plain-text insight paragraphs.
- **Presentation Layer:** The application wraps the generated intelligence in a rigorously tested, hardcoded HTML UI utilizing native `<table>` structures and inline styles. 

### ⏱️ Strict Calendar Day Precision
CEOs need exact data, not "rolling 24-hour" estimates. InsightPress explicitly calculates `startOfYesterday` and `endOfYesterday` to pass precise ISO timestamps to the WooCommerce API.

## 🚀 Deployment & Local Testing

### Local Setup
1. Create an `env.json` file in the root directory (this file is `.gitignore`d).
2. Populate the required environment variables:
   ```json
   {
     "StoreInsightsAgentFunction": {
       "STORE_URL": "https://your-store.com",
       "WC_CONSUMER_KEY": "ck_...",
       "WC_CONSUMER_SECRET": "cs_...",
       "GROQ_API_KEY": "gsk_...",
       "SMTP_HOST": "smtp.purelymail.com",
       "SMTP_PORT": "587",
       "SMTP_USER": "your_email@domain.com",
       "SMTP_PASS": "your_password",
       "FROM_EMAIL": "agent@domain.com",
       "TO_EMAIL": "ceo@domain.com"
     }
   }
   ```
3. Run the script locally: `node test.js`

### AWS Deployment
This project is configured with a complete GitHub Actions CI/CD pipeline. 
Any push to the `main` branch automatically triggers the `.github/workflows/deploy.yml` workflow, which packages the SAM template and deploys the stack to AWS. Ensure your AWS credentials and environment variables are set as GitHub Repository Secrets.

---
*Built for the AWS Builder Center Weekend Agent Challenge.*
