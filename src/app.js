const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const nodemailer = require("nodemailer");

// Helper to determine if we are running in Lambda streaming mode
const isStreaming = typeof awslambda !== "undefined";

const myHandler = async (event, responseStream, context) => {
  try {
    console.log("Starting Daily Store Insights Agent with Groq...");

    const storeUrl = process.env.STORE_URL;
    const consumerKey = process.env.WC_CONSUMER_KEY;
    const consumerSecret = process.env.WC_CONSUMER_SECRET;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!storeUrl || !consumerKey || !consumerSecret) {
      throw new Error("Missing WooCommerce credentials in environment variables.");
    }

    if (!groqApiKey) {
      throw new Error("Missing GROQ_API_KEY in environment variables.");
    }

    const wc = new WooCommerceRestApi({ 
      url: storeUrl, 
      consumerKey, 
      consumerSecret, 
      version: "wc/v3",
      axiosConfig: {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      }
    });

    // 1. Fetch Orders (Past 24 Hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { data: orders } = await wc.get("orders", { after: yesterday.toISOString(), status: "processing,completed", per_page: 100 });
    
    let totalRevenue = 0;
    let processingCount = 0;
    orders.forEach(order => {
      totalRevenue += parseFloat(order.total || 0);
      if (order.status === "processing") processingCount++;
    });

    // 2. Fetch Low Stock Products
    const { data: products } = await wc.get("products", { per_page: 50, stock_status: "instock" });
    const lowStockNames = products
      .filter(p => p.manage_stock && p.stock_quantity !== null && p.stock_quantity <= 5)
      .map(p => `${p.name} (${p.stock_quantity} left in stock)`)
      .slice(0, 10);

    // Get yesterday's date for the report header
    const yesterdayDateString = yesterday.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
You are InsightPress, an AI agent for the store "Khawaja Textile Fabrics".
Generate a premium, modern HTML email report using EXACTLY the following HTML structure. Do NOT wrap your response in markdown blockquotes (no \`\`\`html). Just output the raw HTML.

<div style="font-family: 'Inter', -apple-system, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Khawaja Textile Fabrics</h1>
      <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Daily Performance Report</p>
      <div style="margin-top: 12px; display: inline-block; background: rgba(255,255,255,0.1); padding: 4px 12px; border-radius: 9999px;">
        <span style="color: #cbd5e1; font-size: 12px;">Data for: <strong>${yesterdayDateString}</strong></span>
      </div>
    </div>
    
    <div style="padding: 32px;">
      <!-- Insert a short, encouraging 1-sentence greeting here (wrap in a <p> tag with color: #475569) -->
      
      <div style="margin: 24px 0; background: #f1f5f9; padding: 24px; border-radius: 12px; text-align: center;">
        <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Total Revenue</p>
        <h2 style="margin: 8px 0 0 0; color: #0f172a; font-size: 32px;">Rs. ${totalRevenue.toFixed(2)}</h2>
        <p style="margin: 8px 0 0 0; color: #64748b; font-size: 14px;">from ${orders.length} total orders</p>
      </div>

      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <h3 style="margin: 0 0 8px 0; color: #b45309; font-size: 16px;">Action Required: Pending Fulfillment</h3>
        <p style="margin: 0; color: #92400e; font-size: 14px;">There are currently <strong>${processingCount} orders</strong> waiting to be processed and shipped today.</p>
      </div>

      <h3 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 32px;">Critical Low Stock Alerts</h3>
      <!-- Generate a beautifully styled list of the low stock items here based on the data provided below. Use clean padding and maybe a red color for the stock count -->
      
    </div>
    <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #64748b; font-size: 12px;">Generated automatically by <strong>InsightPress</strong> Agent</p>
    </div>
  </div>
</div>

Data Context:
- Low Stock Items: ${JSON.stringify(lowStockNames)}

Follow the HTML structure exactly. Make sure the low stock list looks very premium. Do NOT include "top selling products".
`;

    // 3. Generate streaming insights with Groq (Llama 3)
    console.log("Invoking Groq API...");
    
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are a helpful retail AI assistant." },
          { role: "user", content: prompt }
        ],
        stream: false
      })
    });

    if (!groqResponse.ok) {
        throw new Error(`Groq API Error: ${groqResponse.status} ${await groqResponse.text()}`);
    }

    const responseBody = await groqResponse.json();
    const fullGeneratedText = responseBody.choices[0].message.content;
    
    console.log("Successfully generated insight with Groq.");

    // Stream directly to the browser if using streaming URL
    if (isStreaming && responseStream) {
      responseStream.setContentType("text/plain");
      responseStream.write(fullGeneratedText);
      responseStream.end();
    }

    // 4. Send email via Purelymail SMTP
    if (fullGeneratedText.length > 10) {
      console.log("Sending proactive email via Purelymail SMTP...");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.purelymail.com",
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `"InsightPress Agent" <${process.env.FROM_EMAIL}>`,
        to: process.env.TO_EMAIL,
        subject: `InsightPress Report: Khawaja Textile Fabrics - ${new Date().toLocaleDateString()}`,
        html: fullGeneratedText,
      });
    }

    // For local tests or non-streaming invocations
    if (!isStreaming) {
      return { statusCode: 200, body: fullGeneratedText };
    }

  } catch (error) {
    console.error("Error:", error);
    if (isStreaming && responseStream) {
      responseStream.write("\\n\\nError: " + error.message + " (Check AWS CloudWatch for full logs)");
      responseStream.end();
    } else {
      throw error;
    }
  }
};

// Export awslambda.streamifyResponse wrapped handler for AWS Lambda
exports.handler = isStreaming ? awslambda.streamifyResponse(myHandler) : myHandler;
