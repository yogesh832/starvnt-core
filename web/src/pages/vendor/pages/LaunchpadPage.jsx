import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { externalApi } from '../../../lib/api.js';
import { Page, Card } from './shared.jsx';

export default function LaunchpadPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const res = await externalApi.call('/vendor/launchpad');
      setData(res);
    } catch (err) {
      setError(err.data?.message || err.message || 'Failed to load launchpad progress.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <Page
      title="30-Day Partner Launchpad"
      sub="Your guided roadmap from profile setup to verified bookings and customer growth."
    >
      <div className="space-y-6">
        {error && (
          <div role="alert" className="p-4 rounded-xl bg-red-50 text-red-800 border border-red-200">
            {error}
          </div>
        )}

        {loading && !data && (
          <Card>
            <p className="text-sm text-gray-500 py-6 text-center">Loading your launchpad progress...</p>
          </Card>
        )}

        {data && (
          <>
            {/* Launchpad Hero Card */}
            <Card>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {data.isFoundingPartner ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        ⭐ Founding Partner ({data.cohort})
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                        🚀 Standard Launchpad
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      Day {data.daysElapsed} of {data.totalDurationDays}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {data.isCompleted ? '🎉 Launchpad Completed!' : `${data.daysRemaining} days remaining in launchpad`}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Complete all 4 phases to unlock verified partner matching and exclusive platform perks.
                  </p>
                </div>

                <div className="text-right flex flex-col items-end">
                  <div className="text-3xl font-extrabold text-primary">
                    {data.progressPercent}%
                  </div>
                  <span className="text-xs text-gray-500">
                    {data.completedCount} of {data.totalSteps} steps completed
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-100 rounded-full h-3 mt-4 overflow-hidden">
                <div
                  className="bg-primary h-3 rounded-full transition-all duration-500"
                  style={{ width: `${data.progressPercent}%` }}
                />
              </div>

              {/* Founding Partner Perks Callout */}
              {data.isFoundingPartner && (
                <div className="mt-4 p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 text-xs text-amber-900 flex flex-wrap gap-4 items-center">
                  <span className="font-bold">✨ Founding Partner Benefits:</span>
                  <span>• 0% Platform Commission</span>
                  <span>• Priority Customer Discovery</span>
                  <span>• Founding Partner Badge</span>
                  <span>• 100 Growth Credits on Completion</span>
                </div>
              )}
            </Card>

            {/* Guided Roadmap Phases */}
            <div className="space-y-6">
              {data.phases.map((phase, pIdx) => {
                const phaseCompleted = phase.steps.every(s => s.completed);
                return (
                  <div key={phase.name} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {pIdx + 1}
                        </span>
                        Phase {pIdx + 1}: {phase.name}
                      </h3>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                        phaseCompleted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {phase.steps.filter(s => s.completed).length}/{phase.steps.length} done
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {phase.steps.map(step => (
                        <div
                          key={step.key}
                          className={`border rounded-2xl p-4 flex flex-col justify-between transition-all ${
                            step.completed
                              ? 'bg-white border-green-200 shadow-sm'
                              : 'bg-white border-gray-200 hover:border-primary/40'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                                step.completed ? 'bg-green-500 text-white font-bold' : 'border border-gray-300 text-gray-400'
                              }`}>
                                {step.completed ? '✓' : ''}
                              </span>
                              <span className="text-[11px] text-gray-400 font-mono">
                                {step.phase}
                              </span>
                            </div>
                            <h4 className={`font-semibold text-sm ${step.completed ? 'text-gray-900' : 'text-gray-800'}`}>
                              {step.label}
                            </h4>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                              {step.description}
                            </p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                            <span className={`text-xs ${step.completed ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}`}>
                              {step.completed ? 'Completed' : 'Pending action'}
                            </span>
                            {!step.completed && step.actionLink && (
                              <Link
                                to={step.actionLink}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                Complete now →
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}
