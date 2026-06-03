const pool = require('./backend/config/db');

async function cleanupUsers() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('--- Database Cleanup Protocol Initialized ---');
        
        const admins = ['lumina.future.ai@gmail.com', 'mohanad.mohamed.24136@gmail.com'];
        
        // 1. Get IDs of users to keep
        const [usersToKeep] = await connection.execute(
            'SELECT id FROM users WHERE email IN (?, ?)', 
            admins
        );
        const keepIds = usersToKeep.map(u => u.id);

        if (keepIds.length > 0) {
            console.log(`Preserving Admin IDs: ${keepIds.join(', ')}`);
            
            // Delete related data for users NOT in the keep list
            // (Manually handling in case CASCADE is not set on all tables)
            await connection.execute('DELETE FROM cart_items WHERE user_email NOT IN (?, ?)', admins);
            await connection.execute('DELETE FROM favorites WHERE user_email NOT IN (?, ?)', admins);
            await connection.execute('DELETE FROM feedbacks WHERE user_email NOT IN (?, ?)', admins);
            
            // Delete products and orders for these users
            await connection.execute('DELETE FROM products WHERE designerEmail NOT IN (?, ?)', admins);
            await connection.execute('DELETE FROM orders WHERE user_email NOT IN (?, ?)', admins);
            
            // Finally, delete the users themselves
            const [result] = await connection.execute(
                'DELETE FROM users WHERE email NOT IN (?, ?)',
                admins
            );
            console.log(`Success: Purged ${result.affectedRows} non-admin accounts.`);
        } else {
            // If no admins found, just clear everything (as requested, but safer to warn)
            console.log('No admin accounts found to preserve. Purging all accounts...');
            await connection.execute('DELETE FROM users');
            console.log('Success: All accounts purged.');
        }
        
    } catch (err) {
        console.error('Cleanup Error:', err);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

cleanupUsers();
