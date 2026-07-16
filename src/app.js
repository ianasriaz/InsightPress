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

    const wc = new WooCommerceRestApi({ url: storeUrl, consumerKey, consumerSecret, version: "wc/v3" });

    // 1. Fetch Orders (Past 24 Hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const { data: orders } = await wc.get("orders", { after: yesterday.toISOString(), status: "processing,completed", per_page: 100 });
    
    let totalRevenue = 0;
    const productCounts = {};
    orders.forEach(order => {
      totalRevenue += parseFloat(order.total || 0);
      order.line_items.forEach(item => {
        if (!productCounts[item.name]) productCounts[item.name] = { qty: 0, revenue: 0 };
        productCounts[item.name].qty += item.quantity;
        productCounts[item.name].revenue += parseFloat(item.total);
      });
    });

    // 2. Fetch Low Stock Products
    const { data: products } = await wc.get("products", { per_page: 50, stock_status: "instock" });
    const lowStockNames = products.filter(p => p.manage_stock && p.stock_quantity !== null && p.stock_quantity <= 5).map(p => p.name).slice(0, 10);

    const prompt = `
You are an expert retail analyst. I am providing you with the sales data for my WooCommerce store over the past 24 hours, and a list of low-stock items.
Please write a short, friendly, and actionable "Morning Briefing" email to the store manager.
Highlight the total revenue, number of orders, mention the top selling products, and URGE them to restock the low stock items.

Data:
Total Orders: ${orders.length}
Total Revenue: $${totalRevenue.toFixed(2)}
Low Stock Items to Restock: ${JSON.stringify(lowStockNames)}

Format the output as a clean, engaging text or markdown email (no subject line).
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
        from: `"Store Insights Agent" <${process.env.FROM_EMAIL}>`,
        to: process.env.TO_EMAIL,
        subject: `Daily Store Insights: ${new Date().toLocaleDateString()}`,
        text: fullGeneratedText,
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
