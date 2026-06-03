const pool = require('./backend/config/db');

async function setupSystem() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('--- System Cleanup & Admin Lockdown Initialized ---');
        
        // 1. Delete all existing users and related data (CASCADE will handle dependencies if FKs are set)
        // If CASCADE isn't set, we do it manually
        await connection.execute('DELETE FROM feedbacks');
        await connection.execute('DELETE FROM cart_items');
        await connection.execute('DELETE FROM order_items');
        await connection.execute('DELETE FROM orders');
        await connection.execute('DELETE FROM subscriptions');
        await connection.execute('DELETE FROM products');
        await connection.execute('DELETE FROM users');
        
        console.log('Success: All existing accounts and related data have been purged.');

        console.log('\n--- Admin Access Rules ---');
        console.log('1. lumina.future.ai@gmail.com');
        console.log('2. mohanad.mohamed.24136@gmail.com');
        
    } catch (err) {
        console.error('Purge Error:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

setupSystem();
