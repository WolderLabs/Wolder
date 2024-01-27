using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.New
{
    public class GeneratorPipeline
    {
        private readonly List<IPipelineStep> _actions = new();

        public void AddStep<TParameters, TAction>(
            Func<IPipelineContext, TParameters> parametersFactory)
                where TParameters : IActionInputParameters
                where TAction : IPipelineAction<TParameters>
        {
            _actions.Add(new PipelineStep<TParameters, TAction>(parametersFactory));
        }
    }
}
