const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db'); // Import the MySQL connection pool
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Master Admin Access List
const MASTER_ADMINS = [
    'lumina.future.ai@gmail.com',
    'mohanad.mohamed.24136@gmail.com'
];

// Setup Nodemailer for Gmail (or any real SMTP)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // use SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: (process.env.EMAIL_PASS || '').replace(/\s/g, '') // Remove all spaces from app password
    }
});

// Verify connection configuration
transporter.verify(function (error, success) {
    if (error) {
        console.error('SMTP Verification Error:', error);
    } else {
        console.log('Server is ready to take our messages');
    }
});

// Setup Multer for uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per file
});

// Error handling middleware for Multer
const uploadMiddleware = (req, res, next) => {
    // Handling multiple images (max 5)
    upload.array('images', 5)(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer Error:', err);
            let message = `Upload error: ${err.message}`;
            if (err.code === 'LIMIT_FILE_SIZE') message = 'File too large (Max 10MB)';
            if (err.code === 'LIMIT_FILE_COUNT') message = 'Too many files (Max 5)';
            return res.status(400).json({ error: message });
        } else if (err) {
            console.error('Unknown Upload Error:', err);
            return res.status(500).json({ error: 'An unknown error occurred during upload.' });
        }
        next();
    });
};

// --- ADMIN PROTOCOL ROUTES ---
router.get('/admin/stats', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [[{ revenue }]] = await connection.execute('SELECT IFNULL(SUM(total_amount), 0) as revenue FROM orders WHERE status != "cancelled"');
        const [[{ orders }]] = await connection.execute('SELECT COUNT(*) as orders FROM orders');
        const [[{ designers }]] = await connection.execute('SELECT COUNT(*) as designers FROM users WHERE role = "designer"');
        const [[{ pending }]] = await connection.execute('SELECT COUNT(*) as pending FROM products WHERE status = "pending"');
        const [monthlyRev] = await connection.execute(`SELECT DATE_FORMAT(created_at, '%b') as month, SUM(total_amount) as total FROM orders WHERE status != 'cancelled' AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) GROUP BY month ORDER BY MIN(created_at)`);
        const [userDist] = await connection.execute(`SELECT role, COUNT(*) as count FROM users GROUP BY role`);
        const [orderDist] = await connection.execute(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`);
        res.json({ revenue, orders, designers, pending, charts: { monthlyRevenue: monthlyRev, userDistribution: userDist, orderDistribution: orderDist } });
    } catch (err) {
        console.error('Admin Stats Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/notifications', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.execute(`CREATE TABLE IF NOT EXISTS notifications (id INT AUTO_INCREMENT PRIMARY KEY, user_email VARCHAR(255), designer_email VARCHAR(255), product_img TEXT, product_name TEXT, message TEXT, status VARCHAR(50) DEFAULT 'unread', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        
        // Ensure columns are updated for existing tables
        try {
            await connection.execute('ALTER TABLE notifications MODIFY COLUMN product_img TEXT');
            await connection.execute('ALTER TABLE notifications MODIFY COLUMN product_name TEXT');
        } catch (e) {}
        const [notifications] = await connection.execute('SELECT * FROM notifications ORDER BY id DESC LIMIT 50');
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/logs', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [logs] = await connection.execute('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100');
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/admin/notifications/read', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.execute("UPDATE notifications SET status = 'read' WHERE status = 'unread'");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/products', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [products] = await connection.execute('SELECT * FROM products ORDER BY id DESC');
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.put('/admin/products/:id/status', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { status } = req.body;
        connection = await pool.getConnection();
        await connection.execute('UPDATE products SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/orders', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [orders] = await connection.execute('SELECT * FROM orders ORDER BY id DESC');
        for (let order of orders) {
            const [items] = await connection.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
            order.items = items;
        }
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.put('/admin/orders/:id/status', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { status } = req.body;
        connection = await pool.getConnection();
        await connection.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/designers', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [designers] = await connection.execute('SELECT id, username, email, phone, bio, photo, address, productsUploadedToday, subscription_tier FROM users WHERE role = "designer" ORDER BY id DESC');
        res.json(designers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/users', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT id, username, email, role, subscription_tier, isVerified FROM users WHERE role != "admin" ORDER BY id DESC');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.delete('/admin/users/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        connection = await pool.getConnection();
        if (id == 1) return res.status(403).json({ error: 'Root administrator cannot be deleted' });
        await connection.execute('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/feedbacks', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [feedbacks] = await connection.execute(`SELECT f.*, u.username as user_name, p.name as product_name FROM feedbacks f LEFT JOIN users u ON f.user_email = u.email LEFT JOIN products p ON f.product_id = p.id ORDER BY f.id DESC`);
        res.json(feedbacks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.delete('/admin/feedbacks/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        connection = await pool.getConnection();
        await connection.execute('DELETE FROM feedbacks WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/admin/finance', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [transactions] = await connection.execute('SELECT * FROM transactions ORDER BY id DESC LIMIT 100');
        const [[stats]] = await connection.execute('SELECT IFNULL(SUM(amount), 0) as total_revenue, COUNT(*) as total_transactions FROM transactions');
        res.json({ transactions, stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- AUTH ROUTES ---
router.post('/auth/signup', async (req, res) => {
    console.log('--- Signup Attempt ---');
    let connection;
    try {
        const { username, email, password, role, address, latitude, longitude } = req.body;
        console.log(`User: ${username}, Email: ${email}, Role: ${role}`);
        
        connection = await pool.getConnection();
        
        // Check if email already exists
        const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            console.log('Error: Email already exists');
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = uuidv4();

        // Enforce Admin Role only for Master Admins
        let finalRole = role || 'user';
        if (MASTER_ADMINS.includes(email.toLowerCase())) {
            finalRole = 'admin';
        } else if (finalRole === 'admin') {
            finalRole = 'user'; // Demote any attempt to signup as admin if not in list
        }

        const newUser = {
            username,
            email,
            password: hashedPassword,
            role: finalRole,
            photo: null,
            productsUploadedToday: 0,
            lastUploadDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
            address: address || '',
            latitude: latitude || null,
            longitude: longitude || null,
            isVerified: 0,
            verificationToken: verificationToken
        };

        const [result] = await connection.execute(
            'INSERT INTO users (username, email, password, role, photo, productsUploadedToday, lastUploadDate, address, latitude, longitude, isVerified, verificationToken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newUser.username, newUser.email, newUser.password, newUser.role, newUser.photo, newUser.productsUploadedToday, newUser.lastUploadDate, newUser.address, newUser.latitude, newUser.longitude, newUser.isVerified, newUser.verificationToken]
        );

        console.log('Signup Successful! Verification email sent.');
        
        const protocol = req.protocol;
        const host = req.get('host');
        const verificationLink = `${protocol}://${host}/api/auth/verify?token=${verificationToken}`;
        
        // Send Real Email with improved anti-spam headers and content
        const mailOptions = {
            from: `"LUMINA Protocol" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Activate Your LUMINA Neural Signature',
            text: `Welcome to LUMINA. Please verify your account using this link: ${verificationLink}`, // Plain text fallback
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background-color: #050505; color: #ffffff; border-radius: 30px; max-width: 600px; margin: auto; border: 1px solid #1a1a1a;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #00F0FF; text-transform: uppercase; letter-spacing: 5px; margin: 0; font-size: 32px;">LUMINA</h1>
                        <p style="color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">Future of Fashion Architecture</p>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.03); padding: 30px; border-radius: 20px; border: 1px solid rgba(0,240,255,0.1);">
                        <p style="font-size: 18px; line-height: 1.6; margin-bottom: 25px;">Welcome, <span style="color: #00F0FF; font-weight: bold;">${username}</span>.</p>
                        <p style="font-size: 14px; color: #ccc; line-height: 1.6; margin-bottom: 30px;">Your neural profile has been initialized. To activate your access to the LUMINA grid and start your journey into visionary fashion, please verify your signature below.</p>
                        
                        <div style="text-align: center;">
                            <a href="${verificationLink}" style="display: inline-block; padding: 18px 40px; background-color: #00F0FF; color: #000000; text-decoration: none; font-weight: 900; border-radius: 15px; text-transform: uppercase; letter-spacing: 2px; font-size: 14px; box-shadow: 0 10px 20px rgba(0,240,255,0.2);">Verify Signature</a>
                        </div>
                    </div>
                    
                    <div style="margin-top: 40px; text-align: center; border-top: 1px solid #1a1a1a; pt-30px;">
                        <p style="color: #444; font-size: 11px; line-height: 1.8; margin-top: 20px;">
                            This is an automated neural transmission from LUMINA Systems.<br>
                            If you did not initiate this protocol, please ignore this message.
                        </p>
                        <p style="color: #00F0FF; font-size: 10px; font-weight: bold; margin-top: 15px;">
                            Master Protocol: lumina.future.ai@gmail.com
                        </p>
                    </div>
                </div>
            `,
            headers: {
                'X-Priority': '1 (Highest)',
                'X-MSMail-Priority': 'High',
                'Importance': 'High',
                'List-Unsubscribe': `<mailto:lumina.future.ai@gmail.com?subject=unsubscribe>`,
                'X-Entity-Ref-ID': uuidv4()
            }
        };

        try {
            console.log(`Attempting to send email to ${email} using ${process.env.EMAIL_USER}...`);
            await transporter.sendMail(mailOptions);
            console.log('Email sent successfully to:', email);
        } catch (mailErr) {
            console.error('Detailed Mail Error:', mailErr);
            throw new Error(`Email Service Error: ${mailErr.message}. Make sure you use a Gmail App Password.`);
        }

        console.log(`\n\n=================================================`);
        console.log(`🚀 [DEVELOPMENT] VERIFICATION LINK FOR: ${email}`);
        console.log(`👉 ${verificationLink}`);
        console.log(`=================================================\n\n`);

        res.status(201).json({ 
            message: 'Signup successful. Please check your email to verify your account.',
            devLink: verificationLink // Re-added for the helper as requested
        });
    } catch (err) {
        console.error('Signup Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/auth/verify', async (req, res) => {
    const { token } = req.query;
    let connection;
    try {
        connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT id FROM users WHERE verificationToken = ?', [token]);
        
        if (users.length === 0) {
            return res.send('<h1>Invalid Verification Link</h1><p>The link is expired or invalid.</p>');
        }

        await connection.execute('UPDATE users SET isVerified = 1, verificationToken = NULL WHERE verificationToken = ?', [token]);
        
        res.send('<h1>Account Verified!</h1><p>Your LUMINA account has been activated. You can now <a href="/login.html">Log In</a>.</p>');
    } catch (err) {
        console.error('Verification Error:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        if (connection) connection.release();
    }
});

router.post('/auth/login', async (req, res) => {
    console.log('--- Login Attempt ---');
    let connection;
    try {
        const { email, password } = req.body;
        console.log(`Email: ${email}`);
        
        connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            console.log('Error: Invalid credentials (email not found)');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];

        // Emergency Role Sync: Ensure master admins always have admin role upon login
        if (MASTER_ADMINS.includes(user.email.toLowerCase()) && user.role !== 'admin') {
            await connection.execute('UPDATE users SET role = "admin" WHERE id = ?', [user.id]);
            user.role = 'admin';
            console.log(`Synced admin role for master account: ${user.email}`);
        }

        if (!user.isVerified) {
            console.log('Error: Account not verified');
            return res.status(403).json({ error: 'Please verify your email before logging in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            console.log('Error: Invalid credentials (password mismatch)');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        console.log('Login Successful!');
        delete user.password;
        res.json(user);
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// Get Profile API
router.get('/auth/profile', async (req, res) => {
    let connection;
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'User ID is required' });

        connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
        
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const user = users[0];
        delete user.password;
        res.json(user);
    } catch (err) {
        console.error('Get Profile Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// Update Profile API
router.patch('/auth/profile', upload.single('photo'), async (req, res) => {
    console.log('--- Profile Update Attempt ---');
    let connection;
    try {
        const { id, username, email, phone, address, bio } = req.body;
        const photo = req.file ? `/uploads/${req.file.filename}` : null;

        connection = await pool.getConnection();

        // Get current user data to check if phone/address are already set
        const [currentUsers] = await connection.execute('SELECT phone, address FROM users WHERE id = ?', [id]);
        if (currentUsers.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const currentUser = currentUsers[0];

        // Construct the update query dynamically
        let updateFields = ['username = ?', 'email = ?', 'bio = ?', 'phone = ?', 'address = ?'];
        let params = [username, email, bio || null, phone || null, address || null];

        if (photo) {
            updateFields.push('photo = ?');
            params.push(photo);
        }

        let query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        params.push(id);

        console.log('Executing query:', query);
        const [result] = await connection.execute(query, params);

        // Get updated user data
        const [updatedUsers] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
        const user = updatedUsers[0];
        delete user.password;

        console.log('Profile Updated Successfully in Database!');
        res.json(user);
    } catch (err) {
        console.error('Profile Update Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- STRIPE SUBSCRIPTION ROUTES ---

// Create Checkout Session
router.post('/stripe/create-checkout-session', async (req, res) => {
    const { userId, email } = req.body;
    
    if (!userId || !email) {
        return res.status(400).json({ error: 'User ID and Email are required' });
    }

    try {
        // 1. Get or create Stripe customer
        let connection = await pool.getConnection();
        const [users] = await connection.execute('SELECT stripe_customer_id FROM users WHERE id = ?', [userId]);
        let stripeCustomerId = users[0]?.stripe_customer_id;

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: email,
                metadata: { userId: userId }
            });
            stripeCustomerId = customer.id;
            await connection.execute('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [stripeCustomerId, userId]);
        }
        connection.release();

        // 2. Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'LUMINA Premium Subscription',
                            description: 'Unlimited asset uploads and exclusive features',
                        },
                        unit_amount: 2999, // $29.99
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${req.protocol}://${req.get('host')}/designer-portal.html?session_id={CHECKOUT_SESSION_ID}&status=success`,
            cancel_url: `${req.protocol}://${req.get('host')}/designer-portal.html?status=cancel`,
            metadata: {
                userId: userId.toString()
            }
        });

        res.json({ id: session.id, url: session.url });
    } catch (err) {
        console.error('Stripe Session Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update Stripe Webhook to handle both
router.post('/stripe/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook Signature Error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        if (session.metadata.type === 'order_payment') {
            // --- HANDLE PRODUCT ORDER ---
            const orderData = {
                user_email: session.metadata.user_email,
                total_amount: session.amount_total / 100,
                shipping: JSON.parse(session.metadata.shipping),
                items: JSON.parse(session.metadata.items),
                payment_method: 'Stripe Credit Card'
            };
            
            try {
                await processOrder(orderData, session.id);
                console.log(`Order processed via Webhook for ${orderData.user_email}`);
            } catch (err) {
                console.error('Webhook Order Processing Error:', err);
            }
        } else {
            // --- HANDLE SUBSCRIPTION (Default) ---
            const userId = session.metadata.userId;
            const customerId = session.customer;
            const subscriptionId = session.subscription;

            let connection;
            try {
                connection = await pool.getConnection();
                await connection.execute('UPDATE users SET subscription_tier = ? WHERE id = ?', ['premium', userId]);
                
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                await connection.execute(
                    'INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start, current_period_end) VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?))',
                    [userId, subscriptionId, customerId, subscription.items.data[0].plan.id, subscription.status, subscription.current_period_start, subscription.current_period_end]
                );
                
                // Also log to transactions
                const [userRows] = await connection.execute('SELECT email FROM users WHERE id = ?', [userId]);
                if (userRows.length > 0) {
                    await connection.execute(
                        'INSERT INTO transactions (user_email, amount, payment_method, transaction_type) VALUES (?, ?, ?, ?)',
                        [userRows[0].email, session.amount_total / 100, 'Stripe Card', 'subscription']
                    );
                }

                console.log(`User ${userId} upgraded to Premium via Stripe!`);
            } catch (dbErr) {
                console.error('Webhook DB Error:', dbErr);
            } finally {
                if (connection) connection.release();
            }
        }
    }

    res.json({received: true});
});

// Update User Subscription Tier
router.post('/auth/update-tier', async (req, res) => {
    const { userId, tier } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.execute('UPDATE users SET subscription_tier = ? WHERE id = ?', [tier, userId]);
        res.json({ success: true, tier });
    } catch (err) {
        console.error('Update Tier Error:', err);
        res.status(500).json({ error: 'Failed to update subscription tier' });
    } finally {
        if (connection) connection.release();
    }
});

// Update User Profile
router.post('/auth/profile/update', (req, res, next) => {
    upload.single('photo')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: 'Multer error: ' + err.message });
        } else if (err) {
            return res.status(500).json({ error: 'Unknown error: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    const { id, username, bio, phone, address } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'User ID is missing' });
    }

    let photoUrl = null;
    if (req.file) {
        photoUrl = `/uploads/${req.file.filename}`;
    }

    let connection;
    try {
        connection = await pool.getConnection();
        
        let query = 'UPDATE users SET username = ?, bio = ?, phone = ?, address = ?';
        let params = [username || '', bio || '', phone || '', address || ''];

        if (photoUrl) {
            query += ', photo = ?';
            params.push(photoUrl);
        }

        query += ' WHERE id = ?';
        params.push(id);

        const [result] = await connection.execute(query, params);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found or no changes made' });
        }

        const [updatedUser] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
        delete updatedUser[0].password;
        
        res.json({ success: true, user: updatedUser[0] });
    } catch (err) {
        console.error('Profile Update Error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- PRODUCT ROUTES ---
router.get('/products', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [products] = await connection.execute(`
            SELECT p.*, u.phone,
            (SELECT AVG(rating) FROM feedbacks WHERE product_id = p.id) as avg_rating
            FROM products p 
            LEFT JOIN users u ON p.designerEmail = u.email
            WHERE p.status = 'approved'
            ORDER BY p.id DESC
        `);
        res.json(products);
    } catch (err) {
        console.error('Get Products Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/products', uploadMiddleware, async (req, res) => {
    const { name, architect, price, email, location, size_s, size_m, size_l, size_xl, size_xxl, quantity, colors, description } = req.body;
    console.log(`--- Product Upload Attempt: ${name} by ${architect} (${email}) ---`);
    
    let connection;
    try {
        connection = await pool.getConnection();
        
        // 1. Validate User and Limits
        const [users] = await connection.execute('SELECT * FROM users WHERE email = ? FOR UPDATE', [email]);
        if (users.length === 0) {
            console.log('Error: Designer not found in database');
            return res.status(404).json({ error: 'Designer not found' });
        }
        
        const user = users[0];
        console.log(`User found: ${user.username}, Role: ${user.role}, Tier: ${user.subscription_tier}`);

        // Check profile completion again on server side
        if (!user.phone || !user.address || !user.bio || !user.photo) {
            console.log('Error: Profile incomplete for upload');
            return res.status(403).json({ error: 'Please complete your profile (Phone, Address, Bio, and Photo) before uploading assets.' });
        }

        let productsUploadedToday = user.productsUploadedToday || 0;
        let lastUploadDate = user.lastUploadDate ? new Date(user.lastUploadDate) : null;
        let weeklyUploadCount = user.weeklyUploadCount || 0;
        let lastWeeklyReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset) : null;
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        // Reset daily if it's a new day
        if (!lastUploadDate || lastUploadDate.toISOString().split('T')[0] !== todayStr) {
            productsUploadedToday = 0;
            lastUploadDate = now;
        }
        
        // Reset weekly if it's been more than 7 days
        if (!lastWeeklyReset || (now - lastWeeklyReset) > 7 * 24 * 60 * 60 * 1000) {
            weeklyUploadCount = 0;
            lastWeeklyReset = now;
        }

        // Apply limits
        if (user.subscription_tier !== 'premium') {
            if (productsUploadedToday >= 10) {
                console.log('Error: Daily upload limit reached');
                return res.status(403).json({ error: 'Daily upload limit (10) reached for free tier' });
            }
            if (weeklyUploadCount >= 7) {
                console.log('Error: Weekly upload limit reached');
                return res.status(403).json({ error: 'Weekly upload limit (7) reached for free tier' });
            }
        }

        // 2. Handle Images
        if (!req.files || req.files.length === 0) {
            console.log('Error: No images uploaded');
            return res.status(400).json({ error: 'At least one image is required' });
        }

        const imageUrls = req.files.map(file => `/uploads/${file.filename}`);
        const primaryImg = imageUrls[0];
        // Ensure we save all images in the 'images' column
        const imagesJson = JSON.stringify(imageUrls);

        // 3. Insert Product
        // Extract location correctly from user address if location not provided in body
        const finalLocation = location || user.address || 'Global';
        const finalName = `${name} @ ${finalLocation}`;
        const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        console.log('--- Initializing Asset Upload Protocol V2 ---');
        console.log('Inserting product into database...');
        const [result] = await connection.execute(
            'INSERT INTO products (name, architect, price, date, img, images, isSold, status, designerEmail, size_s, size_m, size_l, size_xl, size_xxl, quantity, colors, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [finalName, architect, parseFloat(price), dateStr, primaryImg, imagesJson, 0, 'pending', email, size_s || '', size_m || '', size_l || '', size_xl || '', size_xxl || '', parseInt(quantity) || 1, colors || '', description || '']
        );
        
        console.log(`Product inserted successfully with ID: ${result.insertId}`);

        // 4. Update User Stats
        productsUploadedToday++;
        weeklyUploadCount++;
        
        await connection.execute(
            'UPDATE users SET productsUploadedToday = ?, lastUploadDate = ?, weeklyUploadCount = ?, lastWeeklyReset = ? WHERE id = ?',
            [productsUploadedToday, lastUploadDate, weeklyUploadCount, lastWeeklyReset, user.id]
        );

        const [updatedUsers] = await connection.execute('SELECT * FROM users WHERE id = ?', [user.id]);
        const updatedUser = updatedUsers[0];
        delete updatedUser.password;

        res.status(201).json({
            success: true,
            product: {
                id: result.insertId,
                name: finalName,
                architect,
                price,
                img: primaryImg,
                status: 'pending'
            },
            user: updatedUser
        });

    } catch (err) {
        console.error('Product Upload Critical Error:', err);
        res.status(500).json({ error: 'Internal Server Error: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- AI PRODUCT ROUTES ---
router.post('/ai/publish', async (req, res) => {
    let connection;
    try {
        const { name, architect, price, email, img, description } = req.body;
        
        connection = await pool.getConnection();

        const newProduct = {
            name: name,
            architect: architect || 'LUMINA AI',
            price: parseFloat(price),
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            img: img,
            isSold: 0,
            status: 'approved',
            designerEmail: email,
            size_s: 'Available',
            size_m: 'Available',
            size_l: 'Available',
            size_xl: 'Available',
            size_xxl: 'Available',
            description: description || '',
            isAI: 1
        };

        const [result] = await connection.execute(
            'INSERT INTO products (name, architect, price, date, img, isSold, status, designerEmail, size_s, size_m, size_l, size_xl, size_xxl, description, isAI) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newProduct.name, newProduct.architect, newProduct.price, newProduct.date, newProduct.img, newProduct.isSold, newProduct.status, newProduct.designerEmail, newProduct.size_s, newProduct.size_m, newProduct.size_l, newProduct.size_xl, newProduct.size_xxl, newProduct.description, newProduct.isAI]
        );
        
        res.status(201).json({ id: result.insertId, ...newProduct });
    } catch (err) {
        console.error('AI Product Publish Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/ai/products', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [products] = await connection.execute('SELECT * FROM products WHERE isAI = 1');
        res.json(products);
    } catch (err) {
        console.error('Get AI Products Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/products/designer/:email', async (req, res) => {
    const { email } = req.params;
    let connection;
    try {
        connection = await pool.getConnection();
        const [products] = await connection.execute(
            'SELECT * FROM products WHERE designerEmail = ? ORDER BY id DESC',
            [email]
        );
        res.json(products);
    } catch (err) {
        console.error('Get Designer Products Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.patch('/products/:id/sell', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        connection = await pool.getConnection();
        await connection.execute('UPDATE products SET isSold = 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Sell Product Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- NOTIFICATIONS & AI CONTACT ---
router.post('/notifications/ai-contact', async (req, res) => {
    let connection;
    try {
        const { user_email, designer_email, product_img, product_name, message } = req.body;
        connection = await pool.getConnection();

        // Create table if not exists (using TEXT for URLs to prevent "Data too long" errors)
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255),
                designer_email VARCHAR(255),
                product_img TEXT,
                product_name TEXT,
                message TEXT,
                status VARCHAR(50) DEFAULT 'unread',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Force update columns if they exist as VARCHAR to prevent data truncation errors
        try {
            await connection.execute('ALTER TABLE notifications MODIFY COLUMN product_img TEXT');
            await connection.execute('ALTER TABLE notifications MODIFY COLUMN product_name TEXT');
        } catch (alterErr) {
            // Table might not exist yet or columns already TEXT, ignore
        }

        await connection.execute(
            'INSERT INTO notifications (user_email, designer_email, product_img, product_name, message) VALUES (?, ?, ?, ?, ?)',
            [user_email, designer_email, product_img, product_name, message]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('AI Contact Notification Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- SUBSCRIPTION ROUTES ---
router.post('/auth/upgrade', async (req, res) => {
    let connection;
    try {
        const { email, amount, payment_method } = req.body;
        connection = await pool.getConnection();
        
        // Check if user is a designer
        const [users] = await connection.execute('SELECT role FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        if (users[0].role !== 'designer') {
            return res.status(403).json({ error: 'Only designers can upgrade to premium.' });
        }

        await connection.beginTransaction();

        // 1. Upgrade User
        await connection.execute("UPDATE users SET subscription_tier = 'premium' WHERE email = ?", [email]);
        
        // 2. Log Transaction
        await connection.execute(
            'INSERT INTO transactions (user_email, amount, payment_method, transaction_type) VALUES (?, ?, ?, ?)',
            [email, amount || 29.00, payment_method || 'Credit Card', 'subscription']
        );

        await connection.commit();

        const [updatedUsers] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = updatedUsers[0];
        delete user.password;
        
        res.json({ success: true, user });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Upgrade Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// Helper to process orders (Shared between direct API and Webhook)
async function processOrder(orderData, stripeSessionId = null) {
    const { order_id, user_email, total_amount, shipping, items, payment_method } = orderData;
    let connection;
    try {
        connection = await pool.getConnection();

        // Check if order already exists (Deduplication)
        const [existingOrders] = await connection.execute('SELECT id FROM orders WHERE order_id = ? OR (stripe_session_id = ? AND stripe_session_id IS NOT NULL)', [order_id, stripeSessionId]);
        if (existingOrders.length > 0) {
            console.log(`Duplicate Order ignored: ${order_id || stripeSessionId}`);
            return { success: true, message: 'Order already processed', id: existingOrders[0].id };
        }

        await connection.beginTransaction();

        // 1. Insert into orders table
        const [orderResult] = await connection.execute(
            'INSERT INTO orders (order_id, user_email, total_amount, payment_method, shipping_name, shipping_phone, shipping_address, stripe_session_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [order_id || `LUM-STR-${Date.now().toString(36).toUpperCase()}`, user_email, total_amount, payment_method || 'Neural Protocol', shipping.name, shipping.phone, shipping.address, stripeSessionId, 'confirmed']
        );

        const internalOrderId = orderResult.insertId;

        // 2. Insert items into order_items table
        const designerItems = {}; // Map of designerEmail -> array of items
        let itemsHtml = '';

        for (const item of items) {
            const [products] = await connection.execute('SELECT architect, designerEmail FROM products WHERE id = ?', [item.id]);
            const architect = products.length > 0 ? products[0].architect : 'Unknown';
            const designerEmail = products.length > 0 ? products[0].designerEmail : null;
            
            if (designerEmail) {
                if (!designerItems[designerEmail]) designerItems[designerEmail] = [];
                designerItems[designerEmail].push({ ...item, architect });
            }

            await connection.execute(
                'INSERT INTO order_items (order_id, product_id, product_name, price, quantity, architect, designerEmail, selected_size, selected_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [internalOrderId, item.id, item.name, item.price, item.quantity, architect, designerEmail, item.selected_size || null, item.selected_color || null]
            );
            
            itemsHtml += `
                <div style="padding: 15px; border-bottom: 1px solid #1a1a1a; display: flex; align-items: center; gap: 15px;">
                    <div style="flex-grow: 1;">
                        <strong style="color: #fff; font-size: 16px;">${item.name}</strong><br>
                        <small style="color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">
                            Architect: ${architect} | 
                            ${item.selected_size ? `Size: ${item.selected_size} | ` : ''}
                            ${item.selected_color ? `Palette: ${item.selected_color}` : ''}
                        </small>
                    </div>
                    <div style="text-align: right;">
                        <span style="color: #00F0FF; font-weight: 900;">$${item.price}</span>
                        <span style="color: #444; font-size: 10px; margin-left: 5px;">x${item.quantity}</span>
                    </div>
                </div>
            `;

            // Decrease quantity and mark as sold if zero (Neural Inventory Management)
            await connection.execute(
                'UPDATE products SET quantity = GREATEST(0, quantity - ?), isSold = CASE WHEN quantity - ? <= 0 THEN 1 ELSE isSold END WHERE id = ?',
                [item.quantity || 1, item.quantity || 1, item.id]
            );
        }

        // 3. Log Financial Transaction
        await connection.execute(
            'INSERT INTO transactions (user_email, amount, payment_method, transaction_type) VALUES (?, ?, ?, ?)',
            [user_email, total_amount, payment_method || 'Credit Card (Stripe)', 'order']
        );

        // 4. Clear User Cart
        await connection.execute('DELETE FROM cart_items WHERE user_email = ?', [user_email]);

        await connection.commit();

        // 5. Send Confirmation Email to User
        const generatedOrderId = order_id || `LUM-STR-${Date.now().toString(36).toUpperCase()}`;
        
        const userMailOptions = {
            from: `"LUMINA PROTOCOL" <${process.env.EMAIL_USER}>`,
            to: user_email,
            subject: `Neural Manifest: Order ${generatedOrderId} Confirmed`,
            html: `
                <div style="background: #050505; color: white; padding: 40px; font-family: 'Inter', sans-serif; text-align: center; border: 1px solid #1a1a1a;">
                    <div style="margin-bottom: 30px;">
                        <h1 style="color: #00F0FF; font-size: 42px; font-weight: 900; letter-spacing: -2px; margin: 0; text-transform: uppercase;">LUMINA</h1>
                        <p style="text-transform: uppercase; letter-spacing: 5px; font-size: 10px; color: #444; margin-top: 5px;">Future of Fashion Architecture</p>
                    </div>
                    
                    <div style="background: #0a0a0a; border: 1px solid #1a1a1a; padding: 40px; border-radius: 30px; margin: 30px auto; text-align: left; max-width: 600px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #1a1a1a; padding-bottom: 20px;">
                            <div>
                                <h2 style="margin: 0; color: #fff; font-size: 24px; font-weight: 800;">Order Manifested</h2>
                                <p style="color: #666; font-size: 12px; margin-top: 5px;">ID: <span style="color: #00F0FF; font-family: monospace;">${generatedOrderId}</span></p>
                            </div>
                            <div style="background: #00F0FF22; color: #00F0FF; padding: 8px 15px; border-radius: 10px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">Confirmed</div>
                        </div>

                        <p style="color: #aaa; font-size: 14px; line-height: 1.6;">We've successfully verified your neural transaction. Your fashion assets are being prepared for logistics protocol. Welcome to the architecture of the future.</p>
                        
                        <div style="margin: 30px 0; background: #000; padding: 20px; border-radius: 20px; border: 1px solid #111;">
                            <p style="color: #444; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 15px;">Acquired Assets</p>
                            ${itemsHtml}
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 20px; border-top: 1px solid #1a1a1a;">
                            <span style="color: #666; font-size: 14px;">Total Capital Transferred:</span>
                            <strong style="color: #00F0FF; font-size: 28px; font-weight: 900;">$${total_amount}</strong>
                        </div>
                    </div>

                    <div style="max-width: 600px; margin: 0 auto; text-align: left; padding: 0 20px;">
                        <h4 style="color: #444; text-transform: uppercase; font-size: 10px; letter-spacing: 2px; margin-bottom: 10px;">Delivery Node</h4>
                        <p style="color: #888; font-size: 12px; margin: 0; line-height: 1.5;">
                            ${shipping.name}<br>
                            ${shipping.address}<br>
                            ${shipping.phone}
                        </p>
                    </div>

                    <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #1a1a1a;">
                        <p style="color: #333; font-size: 10px; letter-spacing: 1px;">© 2026 LUMINA PROTOCOL | NEURAL FASHION NETWORK</p>
                    </div>
                </div>
            `
        };

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        
        transporter.sendMail(userMailOptions).catch(err => console.error('User Email Failure:', err));

        // 6. Notify Designers (Architects)
        for (const [dEmail, dItems] of Object.entries(designerItems)) {
            let designerItemsHtml = dItems.map(item => `
                <div style="padding: 10px; border-bottom: 1px solid #1a1a1a;">
                    <strong style="color: #FFD700;">${item.name}</strong><br>
                    <small style="color: #666;">Size: ${item.selected_size || 'N/A'} | Palette: ${item.selected_color || 'Default'}</small><br>
                    <span style="color: #fff;">$${item.price} x ${item.quantity}</span>
                </div>
            `).join('');

            const designerMailOptions = {
                from: `"LUMINA LOGISTICS" <${process.env.EMAIL_USER}>`,
                to: dEmail,
                subject: `Neural Alert: Your Asset has been Acquired`,
                html: `
                    <div style="background: #050505; color: white; padding: 40px; font-family: 'Inter', sans-serif; text-align: center;">
                        <div style="margin-bottom: 30px;">
                            <h1 style="color: #FFD700; font-size: 32px; font-weight: 900; margin: 0; text-transform: uppercase;">LUMINA</h1>
                            <p style="text-transform: uppercase; letter-spacing: 5px; font-size: 10px; color: #444;">Sales Protocol Active</p>
                        </div>
                        
                        <div style="background: #0a0a0a; border: 1px solid #FFD70022; padding: 40px; border-radius: 30px; margin: 30px auto; text-align: left; max-width: 600px;">
                            <h2 style="color: #fff; font-size: 20px; font-weight: 800; margin-bottom: 10px;">Asset Manifested for Logistics</h2>
                            <p style="color: #888; font-size: 14px; line-height: 1.6;">Your neural assets have been acquired in order <strong>${generatedOrderId}</strong>. Please initiate logistics protocol immediately.</p>
                            
                            <div style="margin: 25px 0; background: #000; padding: 20px; border-radius: 20px; border: 1px solid #111;">
                                <p style="color: #444; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 15px;">Acquired Items</p>
                                ${designerItemsHtml}
                            </div>

                            <div style="margin: 25px 0; background: #FFD70011; padding: 20px; border-radius: 20px; border: 1px solid #FFD70022;">
                                <p style="color: #FFD700; font-size: 9px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;">Deployment Node (Customer)</p>
                                <p style="color: #ccc; font-size: 12px; margin: 0; line-height: 1.5;">
                                    ${shipping.name}<br>
                                    ${shipping.address}<br>
                                    ${shipping.phone}
                                </p>
                            </div>

                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/designer-portal.html" style="display: block; text-align: center; background: #FFD700; color: #000; padding: 15px; border-radius: 15px; text-decoration: none; font-weight: 900; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Access Designer Vault</a>
                        </div>
                    </div>
                `
            };
            transporter.sendMail(designerMailOptions).catch(err => console.error('Designer Email Failure:', err));
        }

        return { success: true, id: internalOrderId };
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Process Order Error:', err);
        throw err;
    } finally {
        if (connection) connection.release();
    }
}

// Create Order Checkout Session
router.post('/stripe/create-order-session', async (req, res) => {
    const { user_email, items, shipping, total_amount } = req.body;
    
    if (!user_email || !items || items.length === 0) {
        return res.status(400).json({ error: 'Missing order details' });
    }

    try {
        const line_items = items.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.name,
                    description: `Architect: ${item.architect || 'LUMINA'}`,
                },
                unit_amount: Math.round(parseFloat(item.price) * 100), // Stripe expects cents
            },
            quantity: item.quantity || 1,
        }));

        // Add Logistics & Processing if needed
        const itemsSum = items.reduce((sum, i) => sum + (parseFloat(i.price) * (i.quantity || 1)), 0);
        const difference = parseFloat(total_amount) - itemsSum;
        
        if (difference > 0) {
            line_items.push({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Logistics & Neural Processing',
                        description: 'Tax and shipping fees',
                    },
                    unit_amount: Math.round(difference * 100),
                },
                quantity: 1,
            });
        }

        const session = await stripe.checkout.sessions.create({
            customer_email: user_email,
            payment_method_types: ['card'],
            line_items: line_items,
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/customer-dashboard.html?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/index.html?status=cancel`,
            metadata: {
                type: 'order_payment',
                user_email: user_email,
                shipping: JSON.stringify(shipping),
                items: JSON.stringify(items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, selected_size: i.selected_size })))
            }
        });

        res.json({ id: session.id, url: session.url });
    } catch (err) {
        console.error('Stripe Order Session Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- ORDER ROUTES ---
router.post('/orders', async (req, res) => {
    try {
        const result = await processOrder(req.body);
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/orders/:email', async (req, res) => {
    let connection;
    try {
        const { email } = req.params;
        connection = await pool.getConnection();

        // Get orders
        const [orders] = await connection.execute('SELECT * FROM orders WHERE user_email = ? ORDER BY created_at DESC', [email]);

        // For each order, get its items
        const fullOrders = [];
        for (const order of orders) {
            const [items] = await connection.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
            fullOrders.push({
                ...order,
                items: items.map(item => ({
                    ...item,
                    selected_size: item.selected_size // Ensure size is included
                })),
                date: order.created_at, // Use created_at as date
                status: order.status, // Ensure status is passed
                totals: { total: parseFloat(order.total_amount) } // Format for frontend
            });
        }

        res.json(fullOrders);
    } catch (err) {
        console.error('Get Orders Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- SUBSCRIPTION & UPGRADE ROUTES ---
router.post('/auth/upgrade', async (req, res) => {
    let connection;
    try {
        const { userId, email, plan, amount, paymentMethod } = req.body;
        connection = await pool.getConnection();
        await connection.beginTransaction();

        console.log(`--- Processing Premium Upgrade for ${email} ---`);

        // 1. Update User Tier
        const [updateResult] = await connection.execute(
            'UPDATE users SET subscription_tier = ? WHERE id = ?',
            [plan, userId]
        );

        if (updateResult.affectedRows === 0) {
            throw new Error('User not found for upgrade');
        }

        // 2. Log Financial Transaction
        await connection.execute(
            'INSERT INTO transactions (user_email, amount, payment_method, transaction_type) VALUES (?, ?, ?, ?)',
            [email, amount, paymentMethod || 'Neural Credit', 'subscription']
        );

        await connection.commit();

        // 3. Get updated user profile
        const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = rows[0];
        delete user.password;

        // 4. Send Confirmation Email
        const mailOptions = {
            from: `"LUMINA PROTOCOL" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: `Welcome to the Elite: Premium Protocol Activated`,
            html: `
                <div style="background: #000; color: white; padding: 40px; font-family: sans-serif; text-align: center;">
                    <h1 style="color: #FFD700; font-size: 32px; font-weight: 900; letter-spacing: -1px;">LUMINA ELITE</h1>
                    <p style="text-transform: uppercase; letter-spacing: 3px; font-size: 10px; color: #666;">Subscription Manifest</p>
                    <div style="background: #111; border: 1px solid #FFD70033; padding: 30px; border-radius: 20px; margin: 30px 0; text-align: left;">
                        <h2 style="margin-top: 0; color: #FFD700;">Premium Activated</h2>
                        <p style="color: #888;">Welcome to the next level of fashion architecture. Your account has been upgraded to <strong>${plan.toUpperCase()}</strong>.</p>
                        <hr style="border: 0; border-top: 1px solid #222; margin: 20px 0;">
                        <ul style="color: #fff; list-style: none; padding: 0;">
                            <li style="margin-bottom: 10px;">✅ Unlimited Asset Synthesis</li>
                            <li style="margin-bottom: 10px;">✅ Verified Architect Badge</li>
                            <li style="margin-bottom: 10px;">✅ Priority Neural Processing</li>
                            <li style="margin-bottom: 10px;">✅ Advanced Analytics Access</li>
                        </ul>
                    </div>
                    <p style="color: #666; font-size: 11px;">Manifest ID: SUB-${Date.now()}</p>
                    <p style="margin-top: 30px; color: #444; font-size: 10px;">© 2026 LUMINA FUTURE OF FASHION ARCHITECTURE</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions).catch(err => console.error('Upgrade Email Failure:', err));

        res.json({ success: true, user, message: 'Premium Protocol Activated' });
    } catch (err) {
        if (connection) await connection.rollback();
        console.error('Upgrade Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- CART ROUTES ---
router.get('/cart/:email', async (req, res) => {
    let connection;
    try {
        const { email } = req.params;
        connection = await pool.getConnection();
        const [items] = await connection.execute('SELECT * FROM cart_items WHERE user_email = ?', [email]);
        res.json(items);
    } catch (err) {
        console.error('Get Cart Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/cart', async (req, res) => {
    let connection;
    try {
        const { user_email, product_id, name, price, img, architect, quantity, selected_size, selected_color } = req.body;
        connection = await pool.getConnection();

        // Check if item already in cart with same size and color
        const [existing] = await connection.execute(
            'SELECT id, quantity FROM cart_items WHERE user_email = ? AND product_id = ? AND selected_size = ? AND selected_color = ?',
            [user_email, product_id, selected_size || null, selected_color || null]
        );

        if (existing.length > 0) {
            // Update quantity
            await connection.execute(
                'UPDATE cart_items SET quantity = quantity + ? WHERE id = ?',
                [quantity || 1, existing[0].id]
            );
        } else {
            // Insert new item
            await connection.execute(
                'INSERT INTO cart_items (user_email, product_id, name, price, img, architect, quantity, selected_size, selected_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [user_email, product_id, name, price, img, architect, quantity || 1, selected_size || null, selected_color || null]
            );
        }

        const [updatedCart] = await connection.execute('SELECT * FROM cart_items WHERE user_email = ?', [user_email]);
        res.json(updatedCart);
    } catch (err) {
        console.error('Add to Cart Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.delete('/cart/:email/:productId', async (req, res) => {
    let connection;
    try {
        const { email, productId } = req.params;
        connection = await pool.getConnection();
        await connection.execute('DELETE FROM cart_items WHERE user_email = ? AND product_id = ?', [email, productId]);
        const [updatedCart] = await connection.execute('SELECT * FROM cart_items WHERE user_email = ?', [email]);
        res.json(updatedCart);
    } catch (err) {
        console.error('Delete Cart Item Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.delete('/cart/:email', async (req, res) => {
    let connection;
    try {
        const { email } = req.params;
        connection = await pool.getConnection();
        await connection.execute('DELETE FROM cart_items WHERE user_email = ?', [email]);
        res.json({ message: 'Cart cleared' });
    } catch (err) {
        console.error('Clear Cart Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- FAVORITES ROUTES ---
router.get('/favorites/:email', async (req, res) => {
    let connection;
    try {
        const { email } = req.params;
        connection = await pool.getConnection();
        const [favs] = await connection.execute('SELECT product_id FROM favorites WHERE user_email = ?', [email]);
        res.json(favs.map(f => String(f.product_id)));
    } catch (err) {
        console.error('Get Favorites Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/favorites/toggle', async (req, res) => {
    let connection;
    try {
        const { user_email, product_id } = req.body;
        connection = await pool.getConnection();

        const [existing] = await connection.execute(
            'SELECT id FROM favorites WHERE user_email = ? AND product_id = ?',
            [user_email, product_id]
        );

        if (existing.length > 0) {
            await connection.execute('DELETE FROM favorites WHERE id = ?', [existing[0].id]);
        } else {
            await connection.execute('INSERT INTO favorites (user_email, product_id) VALUES (?, ?)', [user_email, product_id]);
        }

        const [updatedFavs] = await connection.execute('SELECT product_id FROM favorites WHERE user_email = ?', [user_email]);
        res.json(updatedFavs.map(f => String(f.product_id)));
    } catch (err) {
        console.error('Toggle Favorite Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/feedbacks/:productId', async (req, res) => {
    let connection;
    try {
        const { productId } = req.params;
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT * FROM feedbacks WHERE product_id = ? ORDER BY created_at DESC',
            [productId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Get Feedbacks Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/feedbacks', async (req, res) => {
    let connection;
    try {
        const { product_id, user_email, user_name, rating, comment } = req.body;
        
        if (!product_id || !user_email || !rating || !comment) {
            return res.status(400).json({ error: 'Missing required feedback parameters' });
        }

        connection = await pool.getConnection();
        
        // Anti-Failure Protocol: Ensure table and columns are perfect
        try {
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS feedbacks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_email VARCHAR(255),
                    user_name VARCHAR(255) DEFAULT 'Anonymous',
                    product_id INT,
                    rating INT,
                    comment TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
                )
            `);
            
            // Check for user_name column specifically
            const [columns] = await connection.execute('SHOW COLUMNS FROM feedbacks');
            if (!columns.map(c => c.Field).includes('user_name')) {
                await connection.execute('ALTER TABLE feedbacks ADD COLUMN user_name VARCHAR(255) DEFAULT "Anonymous" AFTER user_email');
            }
        } catch (migrationErr) {
            console.error('Feedback Auto-Migration Warning:', migrationErr.message);
        }

        await connection.execute(
            'INSERT INTO feedbacks (product_id, user_email, user_name, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [product_id, user_email, user_name || 'Anonymous', rating, comment]
        );
        
        res.status(201).json({ success: true, message: 'Feedback manifested successfully' });
    } catch (err) {
        console.error('Submit Feedback Critical Error:', err);
        res.status(500).json({ error: 'Database protocol failure: ' + err.message });
    } finally {
        if (connection) connection.release();
    }
});

// --- DESIGNER ROUTES ---
router.get('/designers', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [designers] = await connection.execute(`
            SELECT u.id, u.username, u.email, u.bio, u.photo, 
            (SELECT COUNT(*) FROM products p WHERE p.designerEmail = u.email AND p.status = 'approved') as asset_count
            FROM users u 
            WHERE u.role = 'designer' 
            ORDER BY asset_count DESC
            LIMIT 4
        `);
        res.json(designers);
    } catch (err) {
        console.error('Get Designers Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
