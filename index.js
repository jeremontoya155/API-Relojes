require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ZKLib = require('node-zklib');

const app = express();
const port = process.env.PORT || 3000; // Utiliza el puerto configurado en las variables de entorno o el puerto 3000 por defecto
const securityKey = process.env.SECURITY_KEY;

app.set('view engine', 'ejs');
app.use(express.json());
app.use(cors()); // Permitir solicitudes desde cualquier origen

// Middleware para verificar la clave de seguridad en las rutas protegidas
const verifyApiKey = (req, res, next) => {
    const apiKey = req.query.api_key;
    if (apiKey && apiKey === securityKey) {
        next();
    } else {
        return res.status(403).json({ error: "Forbidden: Incorrect API key" });
    }
};

// Cargar las sucursales desde las variables de entorno
const branches = [
    {
        ip: process.env.BRANCH_0_IP,
        name: process.env.BRANCH_0_NAME
    },
    {
        ip: process.env.BRANCH_1_IP,
        name: process.env.BRANCH_1_NAME
    }
];

// Ruta para obtener datos de asistencia (protegida con clave de seguridad)
app.get('/fetch-attendance', verifyApiKey, async (req, res) => {
    const branchQuery = req.query.branch;
    let selectedBranches = branches;

    if (branchQuery) {
        selectedBranches = branches.filter(branch => branch.name === branchQuery);
        if (selectedBranches.length === 0) {
            return res.status(404).json({ error: 'Branch not found' });
        }
    }

    let allAttendanceData = [];

    for (const branch of selectedBranches) {
        if (!branch.ip) continue;

        const zkInstance = new ZKLib(branch.ip, 4375, 10000, 4000);

        try {
            await zkInstance.createSocket();
            console.log(`Fetching attendance data from ${branch.name} (${branch.ip})...`);
            const attendanceData = await zkInstance.getAttendances();

            console.log("Raw attendance data:", attendanceData);

            await zkInstance.disconnect();

            if (attendanceData && Array.isArray(attendanceData.data) && attendanceData.data.length > 0) {
                console.log(`Data received from ${branch.name}:`, attendanceData.data);
                const enrichedData = attendanceData.data.map(record => ({
                    userSn: record.userSn,
                    deviceUserId: record.deviceUserId,
                    recordTime: record.recordTime,
                    ip: record.ip,
                    branch: branch.name
                }));
                allAttendanceData = allAttendanceData.concat(enrichedData);
                console.log(`All data after processing ${branch.name}:`, allAttendanceData);
            } else {
                console.log(`No attendance data found for ${branch.name} (${branch.ip}).`);
            }
        } catch (err) {
            console.error(`Error fetching attendance data from ${branch.name} (${branch.ip}):`, err);
            return res.status(500).json({ error: `Failed to fetch data from ${branch.name} (${branch.ip}): ${err.message}` });
        }
    }

    console.log('Final attendance data to send:', allAttendanceData);

    if (allAttendanceData.length > 0) {
        return res.json({ success: true, data: allAttendanceData });
    } else {
        return res.status(204).json({ success: true, data: [] });
    }
});

// Ruta para la documentación (sin requerir clave de seguridad)
app.get('/documentation', (req, res) => {
    res.render('documentation', {
        apiUrl: `https://api-relojes-production.up.railway.app/fetch-attendance`,
        apiKey: securityKey
    });
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Attendance API running at http://localhost:${port}`);
});
