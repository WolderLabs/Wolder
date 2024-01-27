using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.New
{
    public class PipelineActionContext
    {
        public Task WriteFileAsync(string path, string content)
        {
            return Task.CompletedTask;
        }

        public void AddAction<TParameters, TAction>(Func<IPipelineContext, TParameters> parametersFactory)
            where TParameters : IActionInputParameters
            where TAction : IPipelineAction<TParameters>
        {

        }
    }
}
