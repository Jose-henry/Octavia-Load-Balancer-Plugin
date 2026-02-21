; (function () {

    const CreateWizard = ({ networkId, options, onCreated, onClose }) => {
        const Api = window.Octavia.api;
        const { Field, Badge } = window.Octavia; // Moved inside
        const { Step1_Details, Step2_Listener, Step3_Pool, Step4_Members, Step5_Monitor } = window.Octavia.Steps; // Moved inside

        const [step, setStep] = React.useState(1);
        const [validationMsg, setValidationMsg] = React.useState('');
        const [data, setData] = React.useState({
            networkId,
            createListener: true,
            createPool: true,
            createMonitor: true,
            listenerProtocol: 'HTTP', listenerPort: 80,
            poolProtocol: 'HTTP', poolAlgorithm: 'ROUND_ROBIN',
            monitorType: 'HTTP', members: [],
            delay: 5, timeout: 5, maxRetries: 3, maxRetriesDown: 3,
            httpMethod: 'GET', expectedCodes: '200', urlPath: '/'
        });
        const [loading, setLoading] = React.useState(false);

        const update = (k, v) => setData(p => ({ ...p, [k]: v }));

        // Auto-select first subnet
        React.useEffect(() => {
            if (options && options.subnets && options.subnets.length > 0 && !data.vipSubnetId) {
                // Assuming options.subnets is array of {name, value} or similar
                update('vipSubnetId', options.subnets[0].value);
            }
        }, [options]);

        const validateStep = (s) => {
            if (s === 1) {
                if (!data.name || !data.name.trim()) return "Name is required.";
                if (!data.vipSubnetId) return "VIP Subnet is required.";
            }
            if (s === 2 && data.createListener) {
                if (!data.listenerName || !data.listenerName.trim()) return "Listener Name is required.";
                if (!data.listenerProtocol) return "Listener Protocol is required.";
                if (!data.listenerPort) return "Listener Port is required.";
            }
            if (s === 3 && data.createPool) {
                if (!data.poolName || !data.poolName.trim()) return "Pool Name is required.";
                if (data.sessionPersistence === 'APP_COOKIE' && (!data.cookieName || !data.cookieName.trim())) return "Cookie Name is required.";
            }
            if (s === 5 && data.createMonitor) {
                if (!data.monitorName || !data.monitorName.trim()) return "Monitor Name is required.";
                if (!data.monitorType) return "Monitor Type is required.";
                if (!data.delay) return "Delay is required.";
                if (!data.timeout) return "Timeout is required.";
                if (!data.maxRetries) return "Max Retries is required.";
            }
            return null;
        };

        const handleNext = () => {
            const err = validateStep(step);
            if (err) {
                setValidationMsg(err);
                return;
            }
            setValidationMsg('');
            setStep(step + 1);
        };

        const handlePrevious = () => {
            setValidationMsg('');
            setStep(step - 1);
        };

        const handleTabClick = (targetStep) => {
            if (targetStep > step) {
                // If trying to jump forward, validate current step first
                const err = validateStep(step);
                if (err) {
                    setValidationMsg(err);
                    return;
                }
            }
            setValidationMsg('');
            setStep(targetStep);
        };

        const submit = () => {
            const err = validateStep(5);
            if (err) {
                setValidationMsg(err);
                return;
            }
            setValidationMsg('');
            setLoading(true);
            window.Octavia.api.createLoadBalancer(data)
                .then(() => {
                    setLoading(false);
                    onCreated();
                })
                .catch(e => {
                    setLoading(false);
                    setValidationMsg('Error: ' + e.message);
                });
        };

        const renderStep = () => {
            switch (step) {
                case 1: return <Step1_Details data={data} update={update} options={options} />;
                case 2: return <Step2_Listener data={data} update={update} />;
                case 3: return <Step3_Pool data={data} update={update} />;
                case 4: return <Step4_Members data={data} update={update} options={options} />;
                case 5: return <Step5_Monitor data={data} update={update} />;
                default: return <div>Unknown Step</div>;
            }
        };

        return (
            <div className="modal fade in" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', overflowY: 'auto' }}>
                <div className="modal-dialog modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <button type="button" className="close" data-dismiss="modal" aria-label="Close" onClick={onClose}>
                                <span aria-hidden="true">
                                    <svg version="1.1" className="close-icon" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 59.9 59.9" enableBackground="new 0 0 59.9 59.9" xmlSpace="preserve">
                                        <line fill="none" stroke="currentColor" strokeMiterlimit="10" x1="57.4" y1="2.5" x2="2.5" y2="57.4"></line>
                                        <line fill="none" stroke="currentColor" strokeMiterlimit="10" x1="2.5" y1="2.5" x2="57.4" y2="57.4"></line>
                                    </svg>
                                </span>
                            </button>
                            <h4 className="modal-title">Create Load Balancer</h4>
                        </div>
                        <div className="modal-body">
                            {validationMsg && <div className="alert alert-danger" style={{ padding: '10px 15px', marginBottom: 20 }}>{validationMsg}</div>}
                            <div className="wizard" style={{ marginBottom: 20 }}>
                                <ul className="breadcrumbs" style={{ paddingLeft: 0, margin: 0 }}>
                                    <li className={`bc ${step === 1 ? 'active' : step > 1 ? 'prevActive' : ''}`} onClick={() => handleTabClick(1)} style={{ cursor: 'pointer' }}>
                                        Details
                                    </li>
                                    <li className={`bc ${step === 2 ? 'active' : step > 2 ? 'prevActive' : ''}`} onClick={() => handleTabClick(2)} style={{ cursor: 'pointer' }}>
                                        Listener
                                    </li>
                                    <li className={`bc ${step === 3 ? 'active' : step > 3 ? 'prevActive' : ''}`} onClick={() => handleTabClick(3)} style={{ cursor: 'pointer' }}>
                                        Pool
                                    </li>
                                    <li className={`bc ${step === 4 ? 'active' : step > 4 ? 'prevActive' : ''}`} onClick={() => handleTabClick(4)} style={{ cursor: 'pointer' }}>
                                        Members
                                    </li>
                                    <li className={`bc ${step === 5 ? 'active' : step > 5 ? 'prevActive' : ''}`} onClick={() => handleTabClick(5)} style={{ cursor: 'pointer' }}>
                                        Monitor
                                    </li>
                                </ul>
                            </div>
                            {renderStep()}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-default" onClick={onClose}>Cancel</button>
                            {step > 1 && <button className="btn btn-default" onClick={handlePrevious}>Previous</button>}
                            {step < 5 && <button className="btn btn-primary" onClick={handleNext}>Next</button>}
                            {step === 5 && <button className="btn btn-success" onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create Load Balancer'}</button>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    window.Octavia.CreateWizard = CreateWizard;
})();
