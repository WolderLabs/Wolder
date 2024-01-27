using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.New
{
    public class GeneratorPipeline
    {
        public void AddAction<TInput, TAction>(
            Func<IPipelineContext, TAction> actionFactory) 
                where TAction : IPipelineAction
        {

        }
    }
}
