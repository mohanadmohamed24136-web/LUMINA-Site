const pool = require('./backend/config/db');

async function setup() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('--- STARTING DATABASE SETUP ---');

        const tables = [
            `CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user',
                photo VARCHAR(255),
                bio TEXT,
                subscription_tier VARCHAR(50) DEFAULT 'free',
                productsUploadedToday INT DEFAULT 0,
                lastUploadDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                address TEXT,
                latitude DOUBLE,
                longitude DOUBLE,
                isVerified BOOLEAN DEFAULT FALSE,
                verificationToken VARCHAR(255),
                phone VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                architect VARCHAR(255) NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                date VARCHAR(50),
                img VARCHAR(255),
                images JSON,
                isSold BOOLEAN DEFAULT FALSE,
                status VARCHAR(50) DEFAULT 'pending',
                designerEmail VARCHAR(255),
                size_s VARCHAR(255),
                size_m VARCHAR(255),
                size_l VARCHAR(255),
                size_xl VARCHAR(255),
                size_xxl VARCHAR(255),
                quantity INT DEFAULT 1,
                colors TEXT,
                description TEXT,
                isAI BOOLEAN DEFAULT FALSE,
                phone VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id VARCHAR(255) UNIQUE,
                user_email VARCHAR(255),
                total_amount DECIMAL(10, 2),
                status VARCHAR(50) DEFAULT 'pending',
                payment_method VARCHAR(50),
                shipping_name VARCHAR(255),
                shipping_phone VARCHAR(50),
                shipping_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT,
                product_id INT,
                product_name VARCHAR(255),
                price DECIMAL(10, 2),
                quantity INT,
                architect VARCHAR(255),
                designerEmail VARCHAR(255),
                selected_size VARCHAR(50),
                selected_color VARCHAR(50),
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS cart_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255),
                product_id INT,
                quantity INT DEFAULT 1,
                selected_size VARCHAR(50),
                selected_color VARCHAR(50),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS favorites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255),
                product_id INT,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS feedbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255),
                user_name VARCHAR(255) DEFAULT 'Anonymous',
                product_id INT,
                rating INT,
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )`,
            `CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255),
                amount DECIMAL(10, 2),
                payment_method VARCHAR(50),
                transaction_type VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const sql of tables) {
            await connection.execute(sql);
            console.log(`Executed: ${sql.substring(0, 50)}...`);
        }

        console.log('--- DATABASE SETUP SUCCESSFUL ---');
    } catch (err) {
        console.error('DATABASE SETUP ERROR:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

setup();
