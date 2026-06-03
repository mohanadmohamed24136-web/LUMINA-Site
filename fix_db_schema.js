const pool = require('./backend/config/db');

async function fixSchema() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('--- FIXING DATABASE SCHEMA ---');

        // 1. Fix cart_items table - Add missing columns
        const cartColumns = [
            ['name', 'VARCHAR(255)'],
            ['price', 'DECIMAL(10, 2)'],
            ['img', 'VARCHAR(255)'],
            ['architect', 'VARCHAR(255)'],
            ['selected_size', 'VARCHAR(50)'],
            ['selected_color', 'VARCHAR(50)']
        ];

        for (const [col, type] of cartColumns) {
            try {
                await connection.execute(`ALTER TABLE cart_items ADD COLUMN ${col} ${type}`);
                console.log(`Added ${col} to cart_items`);
            } catch (e) {
                // Ignore if column already exists
                console.log(`Column ${col} might already exist or error: ${e.message}`);
            }
        }

        // 2. Fix users table - Add missing weekly limit columns
        const userColumns = [
            ['weeklyUploadCount', 'INT DEFAULT 0'],
            ['lastWeeklyReset', 'DATETIME DEFAULT CURRENT_TIMESTAMP']
        ];

        for (const [col, type] of userColumns) {
            try {
                await connection.execute(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
                console.log(`Added ${col} to users`);
            } catch (e) {
                // Ignore if column already exists
                console.log(`Column ${col} might already exist or error: ${e.message}`);
            }
        }

        // 3. Fix products table - Add missing columns for upload
        const productColumns = [
            ['images', 'LONGTEXT'],
            ['quantity', 'INT DEFAULT 1'],
            ['colors', 'VARCHAR(255)']
        ];

        for (const [col, type] of productColumns) {
            try {
                await connection.execute(`ALTER TABLE products ADD COLUMN ${col} ${type}`);
                console.log(`Added ${col} to products`);
            } catch (e) {
                console.log(`Column ${col} in products might already exist or error: ${e.message}`);
            }
        }

        // 4. Fix order_items table - Add missing columns
        const orderItemColumns = [
            ['selected_color', 'VARCHAR(50)']
        ];

        for (const [col, type] of orderItemColumns) {
            try {
                await connection.execute(`ALTER TABLE order_items ADD COLUMN ${col} ${type}`);
                console.log(`Added ${col} to order_items`);
            } catch (e) {
                console.log(`Column ${col} in order_items might already exist or error: ${e.message}`);
            }
        }

        // 5. Fix orders table - Add missing columns
        try {
            await connection.execute(`ALTER TABLE orders ADD COLUMN payment_method VARCHAR(50) AFTER status`);
            console.log(`Added payment_method to orders`);
        } catch (e) {
            console.log(`Column payment_method in orders might already exist or error: ${e.message}`);
        }

        console.log('--- SCHEMA FIX COMPLETED ---');
    } catch (err) {
        console.error('SCHEMA FIX ERROR:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

fixSchema();
