<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flight Sim Score Tracker</title>
    <!-- Load Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Load React and Babel for JSX compilation -->
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    
    <!-- Custom Styles for Inter Font and Background -->
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #0d1117; }
        #root {
            display: flex;
            min-height: 100vh;
            flex-direction: column;
            align-items: center;
        }
    </style>
</head>
<body>
    <div id="root"></div>

    <script type="text/babel">
        // Global variables must be defined before use in the script block
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'flightsim-leaderboard-default';

        const { useState, useEffect, useMemo } = React;

        // Load Firebase modules via CDN
        // Note: These need to be loaded globally if using Babel in the browser,
        // but since this is a controlled environment, we can assume the global
        // `firebase` object or similar module access is handled by the canvas.
        // For standard local HTML file usage, we rely on the canvas environment
        // to inject the required globals/modules. In this context, we will use
        // simple global names for clarity, knowing the canvas provides the implementation.

        // We replicate the imports' functionality by assuming these functions are available globally in this specific environment.
        // If running this *outside* the canvas (e.g., on a local machine), the user would need to include separate Firebase CDN scripts
        // and access the functions globally (e.g., firebase.firestore.collection) or use standard ESM imports in a module script,
        // which complicates the single-file setup. We will maintain the React structure assuming the necessary Firebase functions are accessible.
        
        const COLLECTIONS = {
            STUDENTS: 'students',
            SCORES: 'scores',
            CHALLENGES: 'challenges', 
        };

        const CATEGORIES = [
            { id: 'gt1', name: 'Ground Trainer 1', description: 'Focuses on core landing skills.' },
            { id: 'gt2', name: 'Ground Trainer 2', description: 'Advanced challenges with tricky conditions.' },
        ];

        // --- Firebase Access Placeholders (Assumes functions like getFirestore, onSnapshot, etc., are available) ---
        // These are placeholders for the functions that the canvas environment usually provides.
        const initializeApp = (config) => window.firebase.initializeApp(config);
        const getAuth = (app) => window.firebase.auth(app);
        const signInAnonymously = (auth) => window.firebase.auth().signInAnonymously();
        const signInWithCustomToken = (auth, token) => window.firebase.auth().signInWithCustomToken(token);
        const onAuthStateChanged = (auth, callback) => window.firebase.auth().onAuthStateChanged(callback);
        const getFirestore = (app) => window.firebase.firestore(app);
        const collection = (db, path) => window.firebase.firestore().collection(path);
        const onSnapshot = (ref, onNext, onError) => ref.onSnapshot(onNext, onError);
        const addDoc = (ref, data) => ref.add(data);
        const serverTimestamp = () => window.firebase.firestore.FieldValue.serverTimestamp();

        const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
        const auth = app ? getAuth(app) : null;
        const db = app ? getFirestore(app) : null;

        const LoadingSpinner = () => (
            <div className="flex justify-center items-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
                <p className="ml-3 text-emerald-300">Loading data...</p>
            </div>
        );

        const formatScore = (score) => {
            if (score === 0) return 'N/A';
            return score.toLocaleString('en-US');
        };

        // --- Core Application Logic ---

        const useFirestoreData = (db, auth, userId) => {
            const [students, setStudents] = useState([]);
            const [scores, setScores] = useState([]);
            const [challenges, setChallenges] = useState([]); 
            const [loading, setLoading] = useState(true);

            useEffect(() => {
                if (!db || !auth || !userId) {
                    if (db) console.log("Waiting for auth/user ID to initialize listeners...");
                    return;
                }

                setLoading(true);

                // Use the correct Firestore reference structure for a non-ESM environment
                // Note: The path structure must be maintained to match the security rules.
                const getCollectionRef = (collectionName) => db.collection(`artifacts/${appId}/public/data/${collectionName}`);

                const studentsRef = getCollectionRef(COLLECTIONS.STUDENTS);
                const scoresRef = getCollectionRef(COLLECTIONS.SCORES);
                const challengesRef = getCollectionRef(COLLECTIONS.CHALLENGES);

                // Listener for Students
                const unsubscribeStudents = onSnapshot(studentsRef, (snapshot) => {
                    const studentList = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    setStudents(studentList);
                }, (error) => {
                    console.error("Error fetching students:", error);
                });

                // Listener for Scores
                const unsubscribeScores = onSnapshot(scoresRef, (snapshot) => {
                    const scoreList = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        score: Number(doc.data().score)
                    }));
                    setScores(scoreList);
                }, (error) => {
                    console.error("Error fetching scores:", error);
                });
                
                // Listener for Challenges
                const unsubscribeChallenges = onSnapshot(challengesRef, (snapshot) => {
                    const challengeList = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    setChallenges(challengeList);
                    setLoading(false); 
                }, (error) => {
                    console.error("Error fetching challenges:", error);
                    setLoading(false);
                });

                return () => {
                    unsubscribeStudents();
                    unsubscribeScores();
                    unsubscribeChallenges();
                };
            }, [db, auth, userId]);

            return { students, scores, challenges, loading };
        };

        // --- Leaderboard Calculation (Category-wide) ---
        const useCategoryLeaderboard = (students, scores, challenges, categoryId) => {
            return useMemo(() => {
                // 1. Find all challenge IDs belonging to this category
                const challengeIdsInThisCategory = challenges
                    .filter(c => c.categoryId === categoryId)
                    .map(c => c.id);

                // 2. Filter scores relevant to these challenge IDs
                const filteredScores = scores.filter(score => challengeIdsInThisCategory.includes(score.challengeId));

                // 3. Find the highest score per student from the filtered list
                const studentHighScores = filteredScores.reduce((acc, score) => {
                    if (score.studentId) {
                        if (!acc[score.studentId] || score.score > acc[score.studentId].score) {
                            acc[score.studentId] = {
                                score: score.score,
                                timestamp: score.timestamp,
                                studentId: score.studentId,
                            };
                        }
                    }
                    return acc;
                }, {});

                // 4. Build the leaderboard
                const leaderboard = students.map(student => {
                    const highScoreData = studentHighScores[student.id] || { score: 0, timestamp: null };
                    return {
                        id: student.id,
                        name: student.name,
                        highScore: highScoreData.score,
                        lastUpdated: highScoreData.timestamp,
                    };
                }).filter(item => item.highScore > 0); 

                // 5. Sort the leaderboard (Highest score first)
                leaderboard.sort((a, b) => {
                    if (b.highScore !== a.highScore) {
                        return b.highScore - a.highScore;
                    }
                    const timeA = a.lastUpdated?.seconds || 0;
                    const timeB = b.lastUpdated?.seconds || 0;
                    return timeB - timeA;
                });

                return leaderboard;
            }, [students, scores, challenges, categoryId]);
        };

        // --- View Components ---

        const CategoryLeaderboardCard = ({ category, students, scores, challenges, loading }) => {
            const leaderboard = useCategoryLeaderboard(students, scores, challenges, category.id);
            const associatedChallenges = challenges.filter(c => c.categoryId === category.id);

            return (
                <div className="bg-gray-700/50 p-5 rounded-xl shadow-lg h-full flex flex-col">
                    <h3 className="text-2xl font-extrabold text-emerald-300 mb-1">{category.name}</h3>
                    <p className="text-sm text-gray-400 mb-4 italic">{category.description}</p>
                    
                    <p className="text-xs text-gray-500 mb-4">
                        Challenges defined: {associatedChallenges.map(c => c.name).join(', ') || 'None'}
                    </p>

                    {loading ? <LoadingSpinner /> : (
                        <div className="space-y-2 flex-grow">
                            <div className="grid grid-cols-12 font-bold text-gray-400 pb-1 border-b border-gray-600">
                                <div className="col-span-2 text-center">#</div>
                                <div className="col-span-5">Pilot</div>
                                <div className="col-span-5 text-right">Best Score</div>
                            </div>
                            {leaderboard.length === 0 ? (
                                <p className="text-center text-gray-400 p-4 text-sm">
                                    No scores recorded yet for any challenge in this category.
                                </p>
                            ) : (
                                leaderboard.map((student, index) => (
                                    <div key={student.id} className="grid grid-cols-12 items-center py-2 px-1 rounded transition duration-200 hover:bg-gray-700"
                                        style={{
                                            backgroundColor: index === 0 ? 'rgba(52, 211, 163, 0.05)' :
                                                             index === 1 ? 'rgba(96, 165, 250, 0.05)' :
                                                             index === 2 ? 'rgba(251, 191, 36, 0.05)' :
                                                             'transparent',
                                        }}
                                    >
                                        <div className="col-span-2 text-center font-bold"
                                            style={{ color: index === 0 ? '#34d399' : index === 1 ? '#60a5fa' : index === 2 ? '#f59e0b' : '#a7f3d0' }}
                                        >
                                            {index + 1}
                                        </div>
                                        <div className="col-span-5 text-gray-200 text-sm truncate">{student.name}</div>
                                        <div className="col-span-5 text-right text-sm font-mono text-white">{formatScore(student.highScore)}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            );
        }

        const LeaderboardsView = ({ students, scores, challenges, loading }) => {
            return (
                <div className="w-full max-w-7xl p-4 md:p-8 bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-2xl">
                    <h2 className="text-3xl font-extrabold mb-8 text-emerald-400 border-b border-emerald-500/50 pb-2 flex items-center justify-center">
                        <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v14M9 19a2 2 0 002 2h2a2 2 0 002-2M9 19c0 1.105.9 2 2 2h2c1.105 0 2-.895 2-2M9 19v-6M15 19v-6"></path></svg>
                        Ground Trainer Leaderboards Overview
                    </h2>

                    {loading ? <LoadingSpinner /> : (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            {CATEGORIES.map(category => (
                                <CategoryLeaderboardCard
                                    key={category.id}
                                    category={category}
                                    students={students}
                                    scores={scores}
                                    challenges={challenges}
                                    loading={loading}
                                />
                            ))}
                        </div>
                    )}
                </div>
            );
        };


        const AdminView = ({ db, userId, students, challenges, loading }) => {
            // State for adding student
            const [newStudentName, setNewStudentName] = useState('');
            // State for adding challenge
            const [newChallengeCategory, setNewChallengeCategory] = useState(CATEGORIES[0].id);
            const [newChallengeName, setNewChallengeName] = useState('');
            const [newChallengeAirport, setNewChallengeAirport] = useState('');
            // State for adding score
            const [selectedStudentId, setSelectedStudentId] = useState('');
            const [newScore, setNewScore] = useState('');
            const [selectedChallengeId, setSelectedChallengeId] = useState(challenges.length > 0 ? challenges[0].id : '');

            const [message, setMessage] = useState('');

            // Update selected challenge ID if challenges change or if it's currently empty
            useEffect(() => {
                if (!selectedChallengeId && challenges.length > 0) {
                    setSelectedChallengeId(challenges[0].id);
                }
            }, [challenges, selectedChallengeId]);

            const studentOptions = students.map(s => <option key={s.id} value={s.id}>{s.name}</option>);
            const categoryOptions = CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>);

            // Admin Functions
            const handleAddChallenge = async (e) => {
                e.preventDefault();
                if (!db || !newChallengeName.trim() || !newChallengeAirport.trim() || !newChallengeCategory) return;

                try {
                    const category = CATEGORIES.find(c => c.id === newChallengeCategory);
                    const challengesRef = db.collection(`artifacts/${appId}/public/data/${COLLECTIONS.CHALLENGES}`);
                    await challengesRef.add({
                        name: newChallengeName.trim(),
                        airport: newChallengeAirport.trim(),
                        categoryId: newChallengeCategory, 
                        categoryName: category.name,     
                        createdById: userId,
                        createdAt: serverTimestamp(),
                    });
                    setNewChallengeName('');
                    setNewChallengeAirport('');
                    setMessage(`Successfully added challenge: ${newChallengeName.trim()} for ${category.name}`);
                    setTimeout(() => setMessage(''), 3000);
                } catch (error) {
                    console.error("Error adding challenge:", error);
                    setMessage(`Error adding challenge: ${error.message}`);
                    setTimeout(() => setMessage(''), 5000);
                }
            };


            const handleAddStudent = async (e) => {
                e.preventDefault();
                if (!db || !newStudentName.trim()) return;

                try {
                    const studentsRef = db.collection(`artifacts/${appId}/public/data/${COLLECTIONS.STUDENTS}`);
                    await studentsRef.add({
                        name: newStudentName.trim(),
                        createdById: userId,
                        createdAt: serverTimestamp(),
                    });
                    setNewStudentName('');
                    setMessage(`Successfully added pilot: ${newStudentName.trim()}`);
                    setTimeout(() => setMessage(''), 3000);
                } catch (error) {
                    console.error("Error adding student:", error);
                    setMessage(`Error adding pilot: ${error.message}`);
                    setTimeout(() => setMessage(''), 5000);
                }
            };

            const handleAddScore = async (e) => {
                e.preventDefault();
                if (!db || !selectedStudentId || !selectedChallengeId || isNaN(parseInt(newScore))) return;

                const student = students.find(s => s.id === selectedStudentId);
                const challenge = challenges.find(c => c.id === selectedChallengeId);
                if (!student || !challenge) {
                    setMessage("Error: Pilot or Challenge not found. Please check data and refresh.");
                    setTimeout(() => setMessage(''), 3000);
                    return;
                }

                try {
                    const scoresRef = db.collection(`artifacts/${appId}/public/data/${COLLECTIONS.SCORES}`);
                    await scoresRef.add({
                        studentId: selectedStudentId,
                        name: student.name,
                        score: parseInt(newScore, 10),
                        challengeId: selectedChallengeId,
                        challengeName: challenge.name,
                        categoryId: challenge.categoryId, 
                        uploadedById: userId,
                        timestamp: serverTimestamp(),
                    });
                    setNewScore('');
                    setMessage(`Score of ${parseInt(newScore, 10).toLocaleString()} recorded for ${student.name} in ${challenge.name}!`);
                    setTimeout(() => setMessage(''), 3000);
                } catch (error) {
                    console.error("Error adding score:", error);
                    setMessage(`Error adding score: ${error.message}`);
                    setTimeout(() => setMessage(''), 5000);
                }
            };

            return (
                <div className="w-full max-w-4xl p-4 md:p-8 bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-2xl text-white space-y-8">
                    <h2 className="text-3xl font-extrabold text-blue-400 border-b border-blue-500/50 pb-2 flex items-center">
                        <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.222.08 2.573-1.066z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Admin Panel
                    </h2>

                    {message && (
                        <div className="bg-green-600 p-3 rounded mb-4 text-center font-semibold animate-pulse">
                            {message}
                        </div>
                    )}

                    {/* 1. Define New Challenge Section */}
                    <div className="border border-gray-600 p-4 rounded-lg bg-gray-700/30">
                        <h3 className="text-xl font-bold mb-3 text-blue-300">1. Define New Landing Challenge</h3>
                        <form onSubmit={handleAddChallenge} className="flex flex-col gap-4">
                            <label htmlFor="category-select-admin" className="block text-sm font-medium text-gray-400">Select Category</label>
                            <select
                                id="category-select-admin"
                                value={newChallengeCategory}
                                onChange={(e) => setNewChallengeCategory(e.target.value)}
                                className="p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-white"
                                required
                                disabled={loading}
                            >
                                {categoryOptions}
                            </select>
                            <input
                                type="text"
                                placeholder="Challenge Name (e.g., Courchevel Landing)"
                                value={newChallengeName}
                                onChange={(e) => setNewChallengeName(e.target.value)}
                                className="p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-white"
                                required
                                disabled={loading}
                            />
                            <input
                                type="text"
                                placeholder="Airport Code (e.g., LFLJ)"
                                value={newChallengeAirport}
                                onChange={(e) => setNewChallengeAirport(e.target.value)}
                                className="p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-white"
                                required
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition duration-150 shadow-md disabled:opacity-50"
                                disabled={loading || !newChallengeName.trim() || !newChallengeAirport.trim() || !newChallengeCategory}
                            >
                                Create Challenge
                            </button>
                        </form>
                    </div>

                    {/* 2. Add Pilot Section (Unchanged) */}
                    <div className="border border-gray-600 p-4 rounded-lg bg-gray-700/30">
                        <h3 className="text-xl font-bold mb-3 text-gray-200">2. Add New Pilot</h3>
                        <form onSubmit={handleAddStudent} className="flex flex-col sm:flex-row gap-4">
                            <input
                                type="text"
                                placeholder="Student Name / Pilot Callsign"
                                value={newStudentName}
                                onChange={(e) => setNewStudentName(e.target.value)}
                                className="flex-grow p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-emerald-500 focus:border-emerald-500 text-white"
                                required
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md transition duration-150 shadow-md disabled:opacity-50"
                                disabled={loading || !newStudentName.trim()}
                            >
                                Add Pilot
                            </button>
                        </form>
                    </div>

                    {/* 3. Upload Score Section (Updated) */}
                    <div className="border border-gray-600 p-4 rounded-lg bg-gray-700/30">
                        <h3 className="text-xl font-bold mb-3 text-gray-200">3. Upload New Landing Score</h3>
                        <form onSubmit={handleAddScore} className="space-y-4">
                            {/* Challenge Selector */}
                            <div>
                                <label htmlFor="challenge-select" className="block text-sm font-medium text-gray-400 mb-1">Select Specific Challenge</label>
                                <select
                                    id="challenge-select"
                                    value={selectedChallengeId}
                                    onChange={(e) => setSelectedChallengeId(e.target.value)}
                                    className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-blue-500 focus:border-blue-500 text-white"
                                    required
                                    disabled={loading || challenges.length === 0}
                                >
                                    <option value="" disabled>-- Choose a challenge --</option>
                                    {challenges.map(c => <option key={c.id} value={c.id}>{c.name} ({c.airport}) - {c.categoryName}</option>)}
                                </select>
                                {challenges.length === 0 && !loading && (
                                    <p className="text-sm text-red-400 mt-2">No challenges defined. Please create one in Section 1.</p>
                                )}
                            </div>

                            {/* Pilot Selector */}
                            <div>
                                <label htmlFor="student-select" className="block text-sm font-medium text-gray-400 mb-1">Select Pilot</label>
                                <select
                                    id="student-select"
                                    value={selectedStudentId}
                                    onChange={(e) => setSelectedStudentId(e.target.value)}
                                    className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-emerald-500 focus:border-emerald-500 text-white"
                                    required
                                    disabled={loading || students.length === 0}
                                >
                                    <option value="" disabled>-- Choose a pilot --</option>
                                    {studentOptions}
                                </select>
                                {students.length === 0 && !loading && (
                                    <p className="text-sm text-red-400 mt-2">No pilots available. Please add a pilot in Section 2.</p>
                                )}
                            </div>

                            {/* Score Input */}
                            <div>
                                <label htmlFor="score-input" className="block text-sm font-medium text-gray-400 mb-1">Landing Score (e.g., 985000)</label>
                                <input
                                    id="score-input"
                                    type="number"
                                    placeholder="Enter score"
                                    value={newScore}
                                    onChange={(e) => setNewScore(e.target.value)}
                                    className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 focus:ring-emerald-500 focus:border-emerald-500 text-white font-mono"
                                    required
                                    min="1"
                                    disabled={loading || !selectedStudentId || !selectedChallengeId}
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md transition duration-150 shadow-md disabled:opacity-50"
                                disabled={loading || !selectedStudentId || !selectedChallengeId || !newScore || parseInt(newScore) <= 0}
                            >
                                Submit Score
                            </button>
                        </form>
                    </div>
                </div>
            );
        };


        const App = () => {
            const [view, setView] = useState('leaderboard'); 
            const [dbInstance, setDbInstance] = useState(null);
            const [authInstance, setAuthInstance] = useState(null);
            const [userId, setUserId] = useState(null);
            const [isAuthReady, setIsAuthReady] = useState(false);

            // 1. Firebase Initialization and Authentication
            useEffect(() => {
                // Check for the global 'firebase' object provided by the canvas environment
                if (typeof window.firebase === 'undefined') {
                    console.error("Firebase SDK not found. Please ensure the Firebase CDN scripts are loaded.");
                    return;
                }

                const { firestore, auth: firebaseAuth } = window.firebase;
                
                // Set the initial instances based on the global object structure
                const initializedApp = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
                const initializedAuth = initializedApp ? initializedApp.auth() : null;
                const initializedDb = initializedApp ? initializedApp.firestore() : null;


                if (!initializedApp || !initializedAuth || !initializedDb) {
                    console.error("Firebase Initialization failed due to missing config or SDK.");
                    return;
                }

                setDbInstance(initializedDb);
                setAuthInstance(initializedAuth);

                // Sign in using custom token or anonymously
                const authenticate = async () => {
                    try {
                        if (initialAuthToken) {
                            await initializedAuth.signInWithCustomToken(initialAuthToken);
                        } else {
                            // Use the anonymous sign-in function from the auth instance
                            await initializedAuth.signInAnonymously();
                        }
                    } catch (error) {
                        console.error("Firebase Auth Error:", error);
                    }
                };

                // Listen for auth state changes
                const unsubscribe = initializedAuth.onAuthStateChanged((user) => {
                    if (user) {
                        setUserId(user.uid);
                    } else {
                        authenticate();
                    }
                    setIsAuthReady(true);
                });

                return () => unsubscribe();
            }, []);

            // 2. Data fetching from Firestore
            const { students, scores, challenges, loading: dataLoading } = useFirestoreData(dbInstance, authInstance, userId);

            const loading = !isAuthReady || dataLoading;

            return (
                <div className="min-h-screen bg-gray-900 font-sans text-gray-100 p-4 flex flex-col items-center">
                    
                    {/* Header and Navigation */}
                    <header className="w-full max-w-7xl mb-8">
                        <h1 className="text-4xl font-black text-center text-white p-4">
                            <span className="text-emerald-400">Flight Sim</span> Score Tracker
                        </h1>
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={() => setView('leaderboard')}
                                className={`px-6 py-2 rounded-full font-semibold transition duration-200 ${
                                    view === 'leaderboard'
                                        ? 'bg-emerald-600 text-white shadow-lg'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                Leaderboards Overview
                            </button>
                            <button
                                onClick={() => setView('admin')}
                                className={`px-6 py-2 rounded-full font-semibold transition duration-200 ${
                                    view === 'admin'
                                        ? 'bg-blue-600 text-white shadow-lg'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                Admin Panel
                            </button>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="w-full flex justify-center">
                        {loading && <LoadingSpinner />}
                        {!loading && (
                            view === 'leaderboard' ? (
                                <LeaderboardsView
                                    students={students}
                                    scores={scores}
                                    challenges={challenges}
                                    loading={dataLoading}
                                />
                            ) : (
                                <AdminView 
                                    db={dbInstance} 
                                    userId={userId} 
                                    students={students} 
                                    challenges={challenges} 
                                    loading={dataLoading} 
                                />
                            )
                        )}
                    </main>

                    {/* Footer / Debug Info */}
                    <footer className="mt-8 text-center text-xs text-gray-500 max-w-7xl">
                        <p>Data stored publicly for this app ID: {appId}</p>
                        <p>Current User ID: {userId || 'Authenticating...'}</p>
                        <p>Uses Firebase Firestore for real-time score updates.</p>
                    </footer>
                </div>
            );
        };
        
        // Final render call
        const container = document.getElementById('root');
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
    </script>
    
    <!-- IMPORTANT: Firebase CDN scripts must be loaded for the app to function locally -->
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
    
    <!-- Initialize Firebase globally for the React component to access it -->
    <script>
        // Use the global window.firebase object to access services
        window.firebase = firebase;
        
        // Dummy implementation for the functions used in the React component's setup,
        // mapping them to the v8 global access style.
        // This is crucial for the Babel script to find the required Firebase functions.
        window.firebase.initializeApp = window.firebase.initializeApp;
        window.firebase.auth = window.firebase.auth;
        window.firebase.firestore = window.firebase.firestore;
    </script>
</body>
</html>
