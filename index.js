require('dotenv').config();
const express = require('express');
const ZKLib = require('node-zklib');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const securityKey = process.env.SECURITY_KEY; // Consumir la clave de seguridad del .env

app.set('view engine', 'ejs');
app.use(express.json());

// Middleware para verificar la clave de seguridad en las rutas protegidas
const verifyApiKey = (req, res, next) => {
    const apiKey = req.query.api_key; // Obtener la clave de la query (GET)
    if (apiKey && apiKey === securityKey) {
        next();
    } else {
        res.status(403).json({ error: "Forbidden: Incorrect API key" });
    }
};

// Cargamos las sucursales desde las variables de entorno
const branches = [
    {
        ip: process.env.BRANCH_0_IP,
        name: process.env.BRANCH_0_NAME
    },
    {
        ip: process.env.BRANCH_1_IP,
        name: process.env.BRANCH_1_NAME
    }
    // Puedes añadir más sucursales según sea necesario
];

// Ruta para obtener datos de asistencia (protegida con clave de seguridad)
app.get('/fetch-attendance', verifyApiKey, async (req, res) => {
    const branchQuery = req.query.branch; // Obtiene el valor del parámetro 'branch'
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

        const zkInstance = new ZKLib(branch.ip, 4370, 10000, 4000);

        try {
            await zkInstance.createSocket();
            console.log(`Fetching attendance data from ${branch.name} (${branch.ip})...`);
            const attendanceData = await zkInstance.getAttendances();

            console.log("Raw attendance data:", attendanceData);

            await zkInstance.disconnect();

            if (Array.isArray(attendanceData) && attendanceData.length > 0) {
                const enrichedData = attendanceData.map(record => ({
                    ...record,
                    branch: branch.name
                }));
                allAttendanceData = allAttendanceData.concat(enrichedData);
            } else {
                console.log(`No attendance data found for ${branch.name} (${branch.ip}).`);
            }
        } catch (err) {
            console.error(`Error fetching attendance data from ${branch.name} (${branch.ip}):`, err);
        }
    }

    if (allAttendanceData.length > 0) {
        res.json({ success: true, data: allAttendanceData });
    } else {
        res.status(204).json({ success: true, data: [] });
    }
});

// Ruta para la documentación (sin requerir clave de seguridad)
app.get('/documentation', (req, res) => {
    res.render('documentation', {
        apiUrl: `http://localhost:${port}/fetch-attendance`,
        apiKey: securityKey
    });
});

app.listen(port, () => {
    console.log(`Attendance API running at http://localhost:${port}`);
});
