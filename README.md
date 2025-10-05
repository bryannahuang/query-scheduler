# 🧠 Query Scheduler [Prototype]

A smart automation tool that lets you **schedule AI queries** (e.g., via the Perplexity API) on a **weekly, monthly, or yearly** basis — and automatically stores results in **Google Drive**. Ideal for recurring research tasks, reports, or updates.

---

## 🚀 Features

- 🗓️ **Scheduled Queries**  
  Define query frequency (weekly, monthly, yearly) and automate their execution.

- 📂 **Auto Storage to Google Drive**  
  Outputs are automatically saved as Google Docs (or optionally Sheets) for easy access and sharing.

- 🤖 **Follow-Up Chat Scheduling**  
  Schedule additional chat completions or follow-ups to analyze or summarize prior outputs.

- 🔐 **Google Authentication**  
  Secure Google login for Drive, Docs, and Sheets integrations.

---

## 🧩 Tech Stack

| Component | Description |
|------------|-------------|
| **Perplexity API** | Powers the chat completion functionality. |
| **Node.js** | Core runtime for scheduling, API orchestration, and backend logic. |
| **Google Auth API** | Manages authentication for Google Drive, Docs, and Sheets. |

---
