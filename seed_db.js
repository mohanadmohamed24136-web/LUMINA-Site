const pool = require('./backend/config/db');
const bcrypt = require('bcryptjs');

async function seed() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('--- STARTING DATABASE SEEDING ---');

        // 1. Create Admin User
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await connection.execute(
            'INSERT IGNORE INTO users (username, email, password, role, isVerified) VALUES (?, ?, ?, ?, ?)',
            ['Admin', 'admin@lumina.com', hashedPassword, 'admin', 1]
        );
        console.log('Admin user created/verified.');

        // 2. Create a Designer User
        const designerPassword = await bcrypt.hash('designer123', 10);
        await connection.execute(
            'INSERT IGNORE INTO users (username, email, password, role, isVerified, subscription_tier) VALUES (?, ?, ?, ?, ?, ?)',
            ['Designer One', 'designer@lumina.com', designerPassword, 'designer', 1, 'premium']
        );
        console.log('Designer user created/verified.');

        // 3. Create some products
        const products = [
            ['Cyberpunk Jacket', 'LUMINA AI', 299.99, 'May 22, 2026', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800', 0, 'approved', 'designer@lumina.com', 1, 'Cyberpunk style jacket with neon accents'],
            ['Ethereal Gown', 'Designer One', 599.99, 'May 22, 2026', 'https://images.unsplash.com/photo-1518767763163-d6d29a69c973?auto=format&fit=crop&q=80&w=800', 0, 'approved', 'designer@lumina.com', 0, 'Handcrafted gown with flowing fabrics'],
            ['Neon Sneakers', 'LUMINA AI', 199.99, 'May 22, 2026', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=800', 0, 'approved', 'designer@lumina.com', 1, 'Futuristic sneakers with integrated lighting']
        ];

        for (const p of products) {
            await connection.execute(
                'INSERT INTO products (name, architect, price, date, img, isSold, status, designerEmail, isAI, description, size_s, size_m, size_l) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [...p, "Available", "Available", "Available"]
            );
        }
        console.log('Initial products seeded.');

        console.log('--- DATABASE SEEDING SUCCESSFUL ---');
    } catch (err) {
        console.error('DATABASE SEEDING ERROR:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

seed();
