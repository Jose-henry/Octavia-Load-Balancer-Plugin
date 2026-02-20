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
            monitorType: 'HTTP', members: []
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

        const submit = () => {
            setLoading(true);
            window.Octavia.api.createLoadBalancer(data)
                .then(() => {
                    setLoading(false);
                    onCreated();
                })
                .catch(e => {
                    setLoading(false);
                    alert('Error: ' + e.message);
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
            <div className="modal fade in" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <div className="modal-dialog modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <button type="button" className="close" onClick={onClose}>&times;</button>
                            <h4 className="modal-title">Create Load Balancer (Octavia)</h4>
                        </div>
                        <div className="modal-body">
                            <ul className="nav nav-pills nav-justified" style={{ marginBottom: 20 }}>
                                <li className={step === 1 ? 'active' : ''}><a onClick={() => setStep(1)}>1. Details</a></li>
                                <li className={step === 2 ? 'active' : ''}><a onClick={() => setStep(2)}>2. Listener</a></li>
                                <li className={step === 3 ? 'active' : ''}><a onClick={() => setStep(3)}>3. Pool</a></li>
                                <li className={step === 4 ? 'active' : ''}><a onClick={() => setStep(4)}>4. Members</a></li>
                                <li className={step === 5 ? 'active' : ''}><a onClick={() => setStep(5)}>5. Monitor</a></li>
                            </ul>
                            {renderStep()}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-default" onClick={onClose}>Cancel</button>
                            {step > 1 && <button className="btn btn-default" onClick={() => setStep(step - 1)}>Previous</button>}
                            {step < 5 && <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next</button>}
                            {step === 5 && <button className="btn btn-success" onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create Load Balancer'}</button>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    window.Octavia.CreateWizard = CreateWizard;
})();
