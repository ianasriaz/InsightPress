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

    // 1. Fetch Orders (Strictly Yesterday's Calendar Day)
    const now = new Date();
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
    
    const { data: orders } = await wc.get("orders", { 
      after: startOfYesterday.toISOString(), 
      before: endOfYesterday.toISOString(),
      status: "processing,completed", 
      per_page: 100 
    });
    
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
    const yesterdayDateString = startOfYesterday.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
You are InsightPress, an AI retail analyst for the store "Khawaja Textile Fabrics".
Analyze the following daily sales data from yesterday and write a short, highly professional, 2-3 sentence "Daily Insight" addressed to the CEO.
The CEO reads this at 8:00 AM every morning.
Focus on the revenue, pending orders, and the urgency of the low stock. Do NOT use any markdown or HTML. Just plain text. Start directly with the insight (do not include a greeting, it is already handled).

Data:
Total Orders: ${orders.length}
Total Revenue: Rs. ${totalRevenue.toFixed(2)}
Orders Needing Processing: ${processingCount}
Low Stock Items: ${JSON.stringify(lowStockNames)}
`;

    // 3. Generate insight text with Groq (Llama 3)
    console.log("Invoking Groq API...");
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 150
      })
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq API Error: ${groqResponse.status} ${await groqResponse.text()}`);
    }

    const responseBody = await groqResponse.json();
    const generatedInsight = responseBody.choices[0].message.content.trim();
    console.log("Successfully generated insight with Groq.");

    // Build Low Stock HTML
    let lowStockHtml = "";
    if (lowStockNames.length > 0) {
      lowStockNames.forEach(item => {
        lowStockHtml += `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
            <span style="color: #374151; font-size: 14px; font-weight: 500;">${item.split(' (')[0]}</span>
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
            <span style="background-color: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600;">${item.match(/\((.*?)\)/)[1]}</span>
          </td>
        </tr>`;
      });
    } else {
      lowStockHtml = `<tr><td style="padding: 16px; text-align: center; color: #6b7280; font-size: 14px;">All stock levels are healthy!</td></tr>`;
    }

    // Build Bulletproof HTML Email
    const fullHtmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #111827; padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Khawaja Textile Fabrics</h1>
              <p style="margin: 8px 0 0 0; color: #9ca3af; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Daily Performance Report</p>
              <div style="margin-top: 16px;">
                <span style="background-color: rgba(255,255,255,0.1); color: #d1d5db; padding: 6px 12px; border-radius: 20px; font-size: 12px;">${yesterdayDateString}</span>
              </div>
            </td>
          </tr>
          
          <!-- AI Insight -->
          <tr>
            <td style="padding: 32px 24px 24px 24px;">
              <h3 style="margin: 0 0 12px 0; color: #111827; font-size: 18px;">Good morning, CEO.</h3>
              <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">${generatedInsight}</p>
            </td>
          </tr>

          <!-- Metrics -->
          <tr>
            <td style="padding: 0 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- Revenue -->
                  <td width="48%" style="background-color: #f9fafb; border: 1px solid #f3f4f6; border-radius: 8px; padding: 20px; text-align: center;">
                    <p style="margin: 0; color: #6b7280; font-size: 11px; font-weight: 600; text-transform: uppercase;">Total Revenue</p>
                    <h2 style="margin: 8px 0 0 0; color: #111827; font-size: 24px;">Rs. ${totalRevenue.toFixed(2)}</h2>
                    <p style="margin: 4px 0 0 0; color: #9ca3af; font-size: 12px;">${orders.length} Orders</p>
                  </td>
                  <td width="4%"></td>
                  <!-- Processing -->
                  <td width="48%" style="background-color: #fff7ed; border: 1px solid #ffedd5; border-radius: 8px; padding: 20px; text-align: center;">
                    <p style="margin: 0; color: #c2410c; font-size: 11px; font-weight: 600; text-transform: uppercase;">Needs Fulfillment</p>
                    <h2 style="margin: 8px 0 0 0; color: #9a3412; font-size: 24px;">${processingCount}</h2>
                    <p style="margin: 4px 0 0 0; color: #fdba74; font-size: 12px;">Pending Orders</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Low Stock Header -->
          <tr>
            <td style="padding: 32px 24px 12px 24px;">
              <h3 style="margin: 0; color: #111827; font-size: 16px; border-bottom: 2px solid #f3f4f6; padding-bottom: 12px;">Low Stock Alerts</h3>
            </td>
          </tr>

          <!-- Low Stock Table -->
          <tr>
            <td style="padding: 0 24px 32px 24px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                ${lowStockHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #f3f4f6;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">Powered by <strong>InsightPress AI</strong></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    // 4. Send email via Purelymail SMTP
    if (fullHtmlEmail.length > 10) {
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
        html: fullHtmlEmail,
      });
    }

    // For local tests or non-streaming invocations
    if (!isStreaming) {
      return { statusCode: 200, body: fullHtmlEmail };
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
