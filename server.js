const express = require("express");
const axios = require("axios");
const https = require("https");
const path = require("path");
const cron = require("node-cron");
const cors = require("cors");
const app = express();

// CORS configuration to allow only localhost:5173
const corsOptions = {
  origin:["https://turrfzone.com", "https://www.turrfzone.com","https://admin.turrfzone.com","https://www.admin.turrfzone.com"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static("public")); // Serve static files from public directory

const otpStore = new Map(); // key = phone, value = { otp, timeout }
const bookingStore = new Map(); // key = bookingId, value = { phone, userName, dateTime, reminderSent }

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateBookingId() {
  return "TZ" + Date.now() + Math.floor(Math.random() * 1000);
}

function getIndianTime() {
  return new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
}

function formatDateTime(dateTime) {
  const date = new Date(dateTime);
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function sendSms(phone, message, templateId) {
  const params = {
    key: "313f1c72bea43ee668cf9dbe14024272",
    route: "2",
    sender: "INSTNE",
    number: phone,
    templateid: templateId,
    sms: message,
  };

  console.log("Sending SMS with params:",JSON.stringify({ ...params }, null, 2));

  const config = {
    params: params,
    httpsAgent: new (require("https").Agent)({
      rejectUnauthorized: false, // Skip SSL certificate validation
    }),
  };

  return axios.get("https://smsserver.artechnology.pro/api/smsapi", config);
}

function sendOtpSms(phone, otp) {
  const message = `Hi ${phone},
Your TurrfZone login OTP is: ${otp}
Valid for 5 minutes only.
- Team TurrfZone`;

  return sendSms(phone, message, "1407175315919693880");

}

function sendBookingConfirmation(phone, userName, dateTime) {
  const formattedDateTime = formatDateTime(dateTime);
  const message = `Hi ${userName},
Your booking at TurrfZone is confirmed!
Date & Time: ${formattedDateTime}
Thanks for choosing us. Play hard, have fun!`;

  return sendSms(phone, message, "1407175315924646583");
}

function sendBookingReminder(phone, userName) {
  const message = `Hey ${userName},
Reminder: Your TurrfZone booking starts in 30 mins.
Gear up and see you on the turf!`;

  return sendSms(phone, message, "1407175315934525814");
}

function sendBookingCancellation(
  phone,
  userName,
  supportNumber = "9876543210"
) {
  const message = `Hi ${userName},
Your TurrfZone booking has been cancelled.
If you have any questions, call us at ${supportNumber}.
We hope to see you back on the turf soon!`;

  return sendSms(phone, message, "1407175315939535080");
}

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Generate or Resend OTP
app.post("/generate", async (req, res) => {
  console.log('Received OTP request:', req.body);
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "Phone required" });

  // Delete old if exists
  if (otpStore.has(phone)) {
    const old = otpStore.get(phone);
    clearTimeout(old.timeout); // stop auto-delete
    otpStore.delete(phone);
  }

  const otp = generateOtp();

  // Auto delete after 3 mins
  const timeout = setTimeout(() => otpStore.delete(phone), 180000);
  otpStore.set(phone, { otp, timeout });

  try {
    const response = await sendOtpSms(phone, otp);
    console.log('SMS API Response:', response.data);

    // Check if the API response indicates success
    // A numeric response (like message ID) indicates success
    if (
      response.data &&
      (typeof response.data === "number" ||
        (typeof response.data === "string" &&
          (response.data.includes("success") ||
            response.data.includes("sent") ||
            /^\d+$/.test(response.data))))
    ) {
      res.json({ message: "OTP sent successfully", success: true });
    } else {
      // API call succeeded but check the response
      console.log("SMS API returned unexpected response:", response.data);
      res.json({ message: "OTP sent successfully", success: true });
    }
  } catch (err) {
    otpStore.delete(phone);
    console.error("SMS Error Details:", {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      config: {
        url: err.config?.url,
        params: err.config?.params,
      },
    });
    res.status(500).json({ message: "Failed to send SMS", success: false });
  }
});

// ✅ Verify OTP
app.post("/verify", (req, res) => {
  console.log("Received OTP verification request:", req.body);
  const { phone, otp } = req.body;
  if (!phone || !otp)
    return res.status(400).json({ message: "Phone and OTP required" });

  const entry = otpStore.get(phone);
  console.log("OTP Store Entry:", entry);
  if (entry && entry.otp === otp) {
    clearTimeout(entry.timeout);
    otpStore.delete(phone);
    console.log(`OTP verified successfully for phone: ${phone}`);
    return res
      .status(200)
      .json({ message: "OTP verified successfully", success: true });
  }

  res.status(400).json({ message: "Invalid or expired OTP", success: false });
});

// ✅ Create Booking
app.post("/booking", async (req, res) => {
  const { phone, userName, dateTime } = req.body;

  if (!phone || !userName || !dateTime) {
    return res
      .status(400)
      .json({ message: "Phone, userName, and dateTime are required" });
  }

  const bookingId = generateBookingId();
  const bookingDateTime = new Date(dateTime);

  // Check if booking time is in the future
  const now = new Date();
  if (bookingDateTime <= now) {
    return res
      .status(400)
      .json({ message: "Booking time must be in the future" });
  }

  try {
    // Send booking confirmation SMS
    await sendBookingConfirmation(phone, userName, dateTime);

    // Store booking details
    bookingStore.set(bookingId, {
      phone,
      userName,
      dateTime: bookingDateTime,
      reminderSent: false,
      cancelled: false,
    });

    // Schedule reminder SMS 30 minutes before booking
    scheduleReminder(bookingId, phone, userName, bookingDateTime);

    res.json({
      message: "Booking confirmed successfully",
      success: true,
      bookingId: bookingId,
      dateTime: formatDateTime(dateTime),
    });
  } catch (err) {
    console.error("Booking Error Details:", err);
    res
      .status(500)
      .json({ message: "Failed to confirm booking", success: false });
  }
});

// ✅ Get Booking Details
app.get("/booking/:bookingId", (req, res) => {
  const { bookingId } = req.params;
  const booking = bookingStore.get(bookingId);

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  res.json({
    bookingId,
    phone: booking.phone,
    userName: booking.userName,
    dateTime: formatDateTime(booking.dateTime),
    reminderSent: booking.reminderSent,
    status: booking.cancelled ? "cancelled" : "confirmed",
  });
});

// ✅ Cancel Booking
app.post("/booking/:bookingId/cancel", async (req, res) => {
  const { bookingId } = req.params;
  const { supportNumber } = req.body; // Optional support number

  const booking = bookingStore.get(bookingId);

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (booking.cancelled) {
    return res.status(400).json({ message: "Booking already cancelled" });
  }

  try {
    // Send cancellation SMS
    await sendBookingCancellation(
      booking.phone,
      booking.userName,
      supportNumber
    );

    // Mark booking as cancelled
    booking.cancelled = true;
    booking.cancelledAt = new Date();
    bookingStore.set(bookingId, booking);

    res.json({
      message: "Booking cancelled successfully",
      success: true,
      bookingId: bookingId,
      cancelledAt: formatDateTime(booking.cancelledAt),
    });
  } catch (err) {
    console.error("Cancellation Error Details:", err);
    res
      .status(500)
      .json({ message: "Failed to cancel booking", success: false });
  }
});

// ✅ Get All Bookings (for admin/debugging)
app.get("/bookings", (req, res) => {
  const bookings = Array.from(bookingStore.entries()).map(
    ([bookingId, booking]) => ({
      bookingId,
      phone: booking.phone,
      userName: booking.userName,
      dateTime: formatDateTime(booking.dateTime),
      reminderSent: booking.reminderSent,
      status: booking.cancelled ? "cancelled" : "confirmed",
      cancelledAt: booking.cancelledAt
        ? formatDateTime(booking.cancelledAt)
        : null,
    })
  );

  res.json({ bookings });
});

function scheduleReminder(bookingId, phone, userName, bookingDateTime) {
  const now = new Date();
  const timeDiff = bookingDateTime.getTime() - now.getTime(); // Time difference in milliseconds
  const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds

  if (timeDiff <= thirtyMinutes) {
    // If booking is within 30 minutes, send reminder immediately
    console.log(`Booking ${bookingId} is within 30 minutes, sending reminder immediately`);
    sendReminderNow(bookingId, phone, userName);
  } else {
    // If booking is more than 30 minutes away, schedule reminder for 30 minutes before
    const reminderTime = new Date(bookingDateTime.getTime() - thirtyMinutes);
    console.log(`Scheduling reminder for booking ${bookingId} at ${reminderTime.toLocaleString("en-IN",{ timeZone: "Asia/Kolkata" })}`);

    const delay = reminderTime.getTime() - now.getTime();
    setTimeout(() => {
      sendReminderNow(bookingId, phone, userName);
    }, delay);
  }
}

async function sendReminderNow(bookingId, phone, userName) {
  try {
    const booking = bookingStore.get(bookingId);
    if (!booking || booking.reminderSent || booking.cancelled) {
      return; // Booking doesn't exist, reminder already sent, or booking cancelled
    }

    await sendBookingReminder(phone, userName);

    // Mark reminder as sent
    booking.reminderSent = true;
    bookingStore.set(bookingId, booking);

    console.log(`Reminder sent successfully for booking ${bookingId}`);
  } catch (error) {
    console.error(`Failed to send reminder for booking ${bookingId}:`, error);
  }
}

app.listen(5126, () => {
  console.log("TurrfZone OTP & Booking System running on port 5126");
  console.log("Visit http://localhost:5126 to access the frontend");
});
