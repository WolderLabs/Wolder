using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core
{
    public interface IGeneratorScope<TScopeContext>
    {
        IGeneratorScope<TScopeContext> AddLayer(Action<TScopeContext> layer);
        IGeneratorScope<TScopeContext> AddLayer<TOutput>(Func<TScopeContext, TOutput> layer);
    }
}
