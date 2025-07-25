# Lightweight OTP System

A simple and lightweight OTP (One-Time Password) verification system built with Express.js backend and vanilla JavaScript frontend.

## Features

- 📱 Phone number validation
- 🔐 6-digit OTP generation
- ⏱️ 3-minute OTP expiration
- 🔄 Resend OTP functionality
- ✅ Real-time verification
- 📱 Mobile-responsive design
- ⚡ Fast and lightweight

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure SMS Settings

Edit the `sendSms` function in `server.js` with your SMS provider credentials:

```javascript
const params = {
    key: "your_account_key",        // Replace with your SMS provider key
    route: "your_route",            // Replace with your route
    sender: "your_sender_id",       // Replace with your sender ID
    number: phone,
    templateid: "your_template_id", // Replace with your template ID
    sms: message,
    datetime: ""
};
```

### 3. Run the Application

For development (with auto-restart):
```bash
npm run dev
```

For production:
```bash
npm start
```

### 4. Access the Application

Open your browser and go to: `http://localhost:3001`

## Project Structure

```
newlightweightotp/
├── server.js              # Express.js backend
├── package.json           # Project dependencies
├── README.md             # This file
└── public/               # Frontend files
    ├── index.html        # Main HTML page
    ├── styles.css        # CSS styling
    └── script.js         # JavaScript functionality
```

## API Endpoints

### POST /generate
Generate and send OTP to phone number
- **Body**: `{ "phone": "1234567890" }`
- **Response**: `{ "message": "OTP sent successfully", "success": true }`

### POST /verify
Verify the OTP
- **Body**: `{ "phone": "1234567890", "otp": "123456" }`
- **Response**: `{ "message": "OTP verified successfully", "success": true }`

## Frontend Features

- **Step-by-step UI**: Clean progression from phone input → OTP entry → verification success
- **Real-time validation**: Input validation and error handling
- **Countdown timer**: Shows remaining time for OTP validity
- **Responsive design**: Works on desktop and mobile devices
- **Loading states**: Visual feedback during API calls
- **Keyboard support**: Enter key navigation

## Customization

### Styling
Modify `public/styles.css` to change the appearance

### OTP Length
Change the OTP generation in `server.js`:
```javascript
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
}
```

### Expiration Time
Modify the timeout in `server.js`:
```javascript
const timeout = setTimeout(() => otpStore.delete(phone), 180000); // 3 minutes
```

## Security Notes

- OTPs are stored in memory (Map) and auto-deleted after expiration
- Each phone number can only have one active OTP at a time
- Input validation on both frontend and backend
- HTTPS recommended for production use

## License

MIT License
